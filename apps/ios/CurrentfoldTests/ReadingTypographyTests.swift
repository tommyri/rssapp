import XCTest
@testable import Currentfold

/// The reading typography controls: what they write into the stylesheet, and what survives a
/// relaunch.
///
/// The load-bearing claim is the first test's: **Dynamic Type stays the baseline.** A text-size
/// control that set a pixel size would silently opt the article out of the reader's system
/// setting, which is the one accessibility floor design-ux-ios.md names for the web view.
final class ReadingTypographyTests: XCTestCase {
    func testTheDocumentsBaseSizeIsDynamicTypeAndTheControlOnlyMultipliesIt() {
        for size in ReadingTextSize.allCases {
            let css = ArticleDocument.stylesheet(ReadingTypography(size: size))

            XCTAssertTrue(
                css.contains("html { font: -apple-system-body; }"),
                "the root size is the reader's system text size"
            )
            XCTAssertTrue(
                css.contains("font-size: calc(1em * var(--reader-scale));"),
                "and the choice is a multiple of it, not a replacement for it"
            )
            XCTAssertFalse(
                css.contains("font-size: \(Int(size.scale * 17))px"),
                "no absolute type size anywhere"
            )
        }
    }

    func testEachTextSizeWritesItsOwnScale() {
        XCTAssertTrue(css(size: .small).contains("--reader-scale: 0.88;"))
        XCTAssertTrue(css(size: .medium).contains("--reader-scale: 1;"))
        XCTAssertTrue(css(size: .large).contains("--reader-scale: 1.18;"))
    }

    /// Medium changes nothing about the article as it shipped, which is what makes it a safe
    /// default for a reader who never opens the control.
    func testTheDefaultsMatchWhatTheArticleAlreadyLookedLike() {
        let css = ArticleDocument.stylesheet(.default)

        XCTAssertTrue(css.contains("--reader-scale: 1;"))
        XCTAssertTrue(css.contains("--reader-inset: 18px;"))
        XCTAssertTrue(css.contains("font-family: -apple-system, system-ui, sans-serif;"))
    }

    func testTheBodyFontIsTheOneTheReaderChose() {
        XCTAssertTrue(css(font: .serif).contains("font-family: ui-serif,"))
        XCTAssertTrue(css(font: .sans).contains("font-family: -apple-system,"))
    }

    /// On a phone the `ch` ceiling never binds — 52ch is already wider than the screen — so
    /// each width also carries the inset that is what the reader actually sees. A control that
    /// only wrote the ceiling would visibly do nothing.
    func testColumnWidthCarriesBothAMarginAndTheWebsCeiling() {
        for width in ReadingColumnWidth.allCases {
            let css = css(width: width)
            XCTAssertTrue(css.contains("--reader-inset: \(width.sideInset)px;"))
            XCTAssertTrue(css.contains("--reader-measure: \(width.measure)ch;"))
        }

        XCTAssertGreaterThan(
            ReadingColumnWidth.narrow.sideInset,
            ReadingColumnWidth.wide.sideInset,
            "narrow is more margin, not less"
        )
        XCTAssertLessThan(ReadingColumnWidth.narrow.measure, ReadingColumnWidth.wide.measure)
    }

    /// The canvas is the app's in every appearance, and the web view paints none of its own —
    /// the rule that keeps the reading surface inside the dark band survived the rewrite.
    func testTheDocumentStillLeavesTheCanvasToTheApp() {
        let document = ArticleDocument.html(body: "<p>Copy</p>", typography: .default)

        XCTAssertTrue(document.contains("html, body { background: transparent; }"))
        XCTAssertTrue(document.contains("color-scheme: light dark;"))
        XCTAssertTrue(document.contains("<body><p>Copy</p></body>"))
    }

    // MARK: - Persistence

    @MainActor
    func testAChoiceSurvivesARelaunch() {
        let defaults = throwawayDefaults()
        let settings = ReadingSettings(defaults: defaults)

        settings.typography = ReadingTypography(size: .large, font: .serif, width: .narrow)

        let relaunched = ReadingSettings(defaults: defaults)
        XCTAssertEqual(relaunched.typography.size, .large)
        XCTAssertEqual(relaunched.typography.font, .serif)
        XCTAssertEqual(relaunched.typography.width, .narrow)
    }

    /// Per-field fallback, matching the web's `parseTypography`: a value this version does not
    /// recognize costs that one field its default rather than resetting the set.
    @MainActor
    func testAnUnrecognizedStoredValueOnlyCostsItsOwnField() {
        let defaults = throwawayDefaults()
        defaults.set("gigantic", forKey: "currentfold.reading.textSize")
        defaults.set("serif", forKey: "currentfold.reading.bodyFont")

        let settings = ReadingSettings(defaults: defaults)

        XCTAssertEqual(settings.typography.size, .medium)
        XCTAssertEqual(settings.typography.font, .serif)
        XCTAssertEqual(settings.typography.width, .normal)
    }

    @MainActor
    func testAFreshInstallGetsTheDefaults() {
        XCTAssertEqual(ReadingSettings(defaults: throwawayDefaults()).typography, .default)
    }

    // MARK: - Helpers

    private func css(
        size: ReadingTextSize = .medium,
        font: ReadingBodyFont = .sans,
        width: ReadingColumnWidth = .normal
    ) -> String {
        ArticleDocument.stylesheet(ReadingTypography(size: size, font: font, width: width))
    }

    private func throwawayDefaults(
        function: StaticString = #function
    ) -> UserDefaults {
        let suite = "currentfold.tests.\(function).\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suite) else {
            return .standard
        }
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: suite) }
        return defaults
    }
}
