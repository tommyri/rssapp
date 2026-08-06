import CurrentfoldBrand
import SwiftUI
import UIKit
import XCTest
@testable import Currentfold

// The accessibility audit's floors, as measurements.
//
// `ArticlePaletteTests` covers the palette the article stylesheet and the CTA are built from;
// this file covers what the 6 August audit ruled on — the muted ink that replaced
// `.secondaryLabel`, the error ink that replaced `systemRed` as text, the star that could not
// be seen on paper, and the non-text objects (marks, fills, the progress line, the opaque
// receipt) that answer to WCAG's 3:1 rather than 4.5:1. It shares that file's `RGB`, so both
// sets of numbers come out of the same arithmetic.

/// Guards the muted ink that replaced `.secondaryLabel`.
///
/// The accessibility audit (6 Aug) measured the platform's secondary label at 3.4:1 on our
/// light canvas — below AA for text that is a snippet, a date and a reading estimate. The app
/// already shipped a muted ink that clears the floor, inside the article web view, so the fix
/// was to use the same one outside it rather than invent a third grey.
@MainActor
final class BrandSecondaryInkTests: XCTestCase {
    func testTheMutedInkIsTheArticleStylesheetsOwnMutedColor() {
        assertSameColor(RGB(BrandSecondaryInk.onLight), RGB(hex: ArticlePalette.mutedLight))
        assertSameColor(RGB(BrandSecondaryInk.onDark), RGB(hex: ArticlePalette.mutedDark))
        assertSameColor(RGB(BrandSecondaryInk.onLight), RGB(CurrentfoldBrand.stone))
    }

    func testTheMutedInkClearsWCAGAAOnEverySurfaceItLandsOn() {
        for surface in [BrandSurface.canvasLight, BrandSurface.raisedLight] {
            XCTAssertGreaterThanOrEqual(
                RGB(BrandSecondaryInk.onLight).contrast(with: RGB(surface)), 4.5, surface.css
            )
        }
        for surface in [BrandSurface.canvasDark, BrandSurface.raisedDark] {
            XCTAssertGreaterThanOrEqual(
                RGB(BrandSecondaryInk.onDark).contrast(with: RGB(surface)), 4.5, surface.css
            )
        }
    }

    /// The measurement that retired `.secondaryLabel`, kept so nobody puts it back by writing
    /// `.foregroundStyle(.secondary)` and assuming the platform handles it.
    func testThePlatformsSecondaryLabelStillMissesTheFloorOnOurCanvas() {
        let paper = RGB(BrandSurface.canvasLight)
        let platform = RGB(
            UIColor.secondaryLabel.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)),
            over: paper
        )
        XCTAssertLessThan(platform.contrast(with: paper), 4.5)
    }

    /// Muted has to stay *muted*: the point of the token is a legible subordinate, not a second
    /// primary. The primary label is ~19.9:1 on paper, so there is room for both.
    func testTheMutedInkStaysVisiblySubordinateToThePrimaryLabel() {
        let paper = RGB(BrandSurface.canvasLight)
        let primary = RGB(
            UIColor.label.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        )
        XCTAssertLessThan(
            RGB(BrandSecondaryInk.onLight).contrast(with: paper),
            primary.contrast(with: paper) / 3
        )
    }

    /// Increase Contrast darkens `.secondaryLabel`; a static replacement would have quietly
    /// stopped answering the setting, so the token answers it too.
    func testIncreaseContrastStrengthensTheMutedInkInBothAppearances() {
        let light = resolved(BrandSecondaryInk.color, .light, contrast: .high)
        let dark = resolved(BrandSecondaryInk.color, .dark, contrast: .high)
        assertSameColor(light, RGB(BrandSecondaryInk.onLightHighContrast))
        assertSameColor(dark, RGB(BrandSecondaryInk.onDarkHighContrast))

        XCTAssertGreaterThanOrEqual(light.contrast(with: RGB(BrandSurface.canvasLight)), 7)
        XCTAssertGreaterThanOrEqual(dark.contrast(with: RGB(BrandSurface.canvasDark)), 7)
    }

    func testTheDynamicMutedInkResolvesToTheMeasuredValues() {
        assertSameColor(resolved(BrandSecondaryInk.color, .light), RGB(BrandSecondaryInk.onLight))
        assertSameColor(resolved(BrandSecondaryInk.color, .dark), RGB(BrandSecondaryInk.onDark))
    }
}

/// Guards error text, and the line between text and a destructive *fill*.
///
/// The audit measured `systemRed` as text at 3.4:1 on the light canvas. Dark was never the
/// problem, which is why the dark half of the token is the platform's own value: a floor token
/// exists to hold the floor, not to repaint what already clears it.
@MainActor
final class BrandErrorInkTests: XCTestCase {
    private let paper = RGB(BrandSurface.canvasLight)

    func testTheLightErrorInkIsThePlatformsRedDarkenedLikeTheAccent() {
        assertSameColor(
            RGB(BrandErrorInk.onLight),
            RGB(hex: PlatformBaseline.systemRedLight).mixed(with: .black, amount: 0.25)
        )
    }

    /// Dark is the platform's, unmodified — the token claims that, so it is measured.
    func testTheDarkErrorInkIsThePlatformsOwnRed() {
        assertSameColor(RGB(BrandErrorInk.onDark), RGB(hex: PlatformBaseline.systemRedDark))
    }

    /// Increase Contrast is not answered here, and this is the reason: the platform's own
    /// high-contrast red is *weaker* on our paper than this token's ordinary value, so there
    /// is nothing to switch to.
    func testThePlatformsHighContrastRedWouldBeAStepDown() {
        let highContrast = RGB(hex: PlatformBaseline.systemRedLightHighContrast)
        XCTAssertLessThan(highContrast.contrast(with: paper), 4.5)
        XCTAssertLessThan(
            highContrast.contrast(with: paper),
            RGB(BrandErrorInk.onLight).contrast(with: paper)
        )
    }

    func testErrorTextClearsWCAGAAOnEverySurfaceItLandsOn() {
        for surface in [BrandSurface.canvasLight, BrandSurface.raisedLight] {
            XCTAssertGreaterThanOrEqual(
                RGB(BrandErrorInk.onLight).contrast(with: RGB(surface)), 4.5, surface.css
            )
        }
        for surface in [BrandSurface.canvasDark, BrandSurface.raisedDark] {
            XCTAssertGreaterThanOrEqual(
                RGB(BrandErrorInk.onDark).contrast(with: RGB(surface)), 4.5, surface.css
            )
        }
    }

    /// The measurement that started the ruling, taken from the *running* system so that "just
    /// use `.red`" stays wrong however the platform's palette drifts.
    func testThePlatformsLightRedStillMissesTheTextFloorOnPaper() {
        XCTAssertLessThan(
            RGB(systemColor(.systemRed, .light)).contrast(with: paper),
            4.5
        )
    }

    func testTheDynamicErrorInkResolvesToTheMeasuredValues() {
        assertSameColor(resolved(BrandErrorInk.color, .light), RGB(BrandErrorInk.onLight))
        assertSameColor(resolved(BrandErrorInk.color, .dark), RGB(BrandErrorInk.onDark))
    }
}

/// Guards every colour the app uses as a *fill* or a *mark* rather than as text: WCAG 1.4.11's
/// 3:1, not 4.5:1.
///
/// The audit found one real failure here — the star, at 1.4:1 on paper, and the only thing in a
/// row that says an article is starred. The rest are measured so the next tint change has a
/// number to beat.
@MainActor
final class NonTextContrastTests: XCTestCase {
    private let lightSurfaces = [BrandSurface.canvasLight, BrandSurface.raisedLight]
    private let darkSurfaces = [BrandSurface.canvasDark, BrandSurface.raisedDark]

    /// Both halves are the platform's own yellow: light is the value iOS itself resolves under
    /// Increase Contrast, adopted as our ordinary one; dark is the ordinary one, untouched.
    func testTheStarInkIsThePlatformsOwnYellowInBothAppearances() {
        assertSameColor(
            RGB(BrandStarInk.onLight),
            RGB(hex: PlatformBaseline.systemYellowLightHighContrast)
        )
        assertSameColor(RGB(BrandStarInk.onDark), RGB(hex: PlatformBaseline.systemYellowDark))
    }

    func testTheStarMarkerClearsTheNonTextFloorOnEverySurface() {
        for surface in lightSurfaces {
            XCTAssertGreaterThanOrEqual(
                RGB(BrandStarInk.onLight).contrast(with: RGB(surface)), 3, surface.css
            )
        }
        for surface in darkSurfaces {
            XCTAssertGreaterThanOrEqual(
                RGB(BrandStarInk.onDark).contrast(with: RGB(surface)), 3, surface.css
            )
        }
    }

    /// The failure this token exists for, measured against whatever the *running* system calls
    /// `systemYellow` rather than a recorded value — so "just use `Color.yellow`" stays wrong
    /// however the platform's palette drifts.
    func testThePlatformsYellowStillFailsAsAMarkOnPaper() {
        XCTAssertLessThan(
            RGB(systemColor(.systemYellow, .light)).contrast(with: RGB(BrandSurface.canvasLight)),
            3
        )
    }

    /// The unread dot is a graphical object, not text, and it is the whole read-state signal.
    func testTheUnreadDotClearsTheNonTextFloorOnEverySurface() {
        for surface in lightSurfaces {
            XCTAssertGreaterThanOrEqual(
                RGB(BrandAccentInk.onLight).contrast(with: RGB(surface)), 3, surface.css
            )
        }
        for surface in darkSurfaces {
            XCTAssertGreaterThanOrEqual(
                RGB(BrandAccentInk.onDark).contrast(with: RGB(surface)), 3, surface.css
            )
        }
    }

    /// A revealed swipe action is a filled shape on the row's canvas, so the *fill* has to be
    /// findable. Its white label is the platform's choice, not ours — see design-ux-ios.md's
    /// recorded exception for the numbers there.
    func testEverySwipeFillStandsOffTheCanvasInBothAppearances() {
        let verbs: [(String, UIColor)] = [
            ("read/unread", .systemBlue),
            ("read later", .systemIndigo),
            ("remove", .systemRed),
        ]
        for (name, color) in verbs {
            XCTAssertGreaterThanOrEqual(
                RGB(systemColor(color, .light)).contrast(with: RGB(BrandSurface.canvasLight)),
                3,
                "\(name), light"
            )
            XCTAssertGreaterThanOrEqual(
                RGB(systemColor(color, .dark)).contrast(with: RGB(BrandSurface.canvasDark)),
                3,
                "\(name), dark"
            )
        }
        XCTAssertGreaterThanOrEqual(
            RGB(BrandStarInk.onLight).contrast(with: RGB(BrandSurface.canvasLight)), 3, "star, light"
        )
        XCTAssertGreaterThanOrEqual(
            RGB(BrandStarInk.onDark).contrast(with: RGB(BrandSurface.canvasDark)), 3, "star, dark"
        )
    }

    /// The reading progress line has two boundaries that carry its value: the filled part
    /// against the page, and — the one that actually says *how far* — filled against unfilled.
    /// The track is `.separator`, which is a 12%-alpha hairline in light, so the second
    /// boundary is nearly the first.
    func testTheProgressBarsFilledPortionIsLegibleAgainstBothTheCanvasAndItsTrack() {
        for (style, canvas, ink) in [
            (UIUserInterfaceStyle.light, BrandSurface.canvasLight, BrandAccentInk.onLight),
            (.dark, BrandSurface.canvasDark, BrandAccentInk.onDark),
        ] {
            let track = RGB(
                UIColor.separator.resolvedColor(with: UITraitCollection(userInterfaceStyle: style)),
                over: RGB(canvas)
            )
            XCTAssertGreaterThanOrEqual(RGB(ink).contrast(with: RGB(canvas)), 3, canvas.css)
            XCTAssertGreaterThanOrEqual(RGB(ink).contrast(with: track), 3, canvas.css)
        }
    }

    /// Reduce Transparency swaps the mark-all-read capsule's material for an opaque surface.
    /// The label has to survive the swap, and — in light, where a raised surface is barely a
    /// step at all — the capsule cannot rely on its fill to be seen, which is why the opaque
    /// version also draws an edge.
    func testTheOpaqueReceiptKeepsItsLabelAndCannotRelyOnItsFill() {
        for (style, surface) in [
            (UIUserInterfaceStyle.light, BrandSurface.raisedLight),
            (.dark, BrandSurface.raisedDark),
        ] {
            let label = RGB(UIColor.label.resolvedColor(with: UITraitCollection(userInterfaceStyle: style)))
            XCTAssertGreaterThanOrEqual(label.contrast(with: RGB(surface)), 4.5, surface.css)
        }

        XCTAssertLessThan(
            RGB(BrandSurface.raisedLight).contrast(with: RGB(BrandSurface.canvasLight)),
            1.1
        )
    }

    /// The light-mode raised surface is a 1.03 step where stock iOS is 1.13 — a real finding,
    /// still open for a bright-daylight check on a device. What is *not* open is whether the
    /// app has any other way to show structure: a hairline separator is a stronger edge than
    /// the fill difference by a wide margin, in both appearances.
    func testSeparatorsCarryMoreStructureThanTheRaisedFillDifference() {
        for (style, canvas) in [
            (UIUserInterfaceStyle.light, BrandSurface.canvasLight),
            (.dark, BrandSurface.canvasDark),
        ] {
            let raised = style == .light ? BrandSurface.raisedLight : BrandSurface.raisedDark
            let hairline = RGB(
                UIColor.separator.resolvedColor(with: UITraitCollection(userInterfaceStyle: style)),
                over: RGB(canvas)
            )
            XCTAssertGreaterThan(
                hairline.contrast(with: RGB(canvas)),
                RGB(raised).contrast(with: RGB(canvas)),
                canvas.css
            )
        }
    }
}

/// The platform values our tokens are derived *from*, recorded rather than read live.
///
/// A derivation test wants a fixed number: "this token is the system's red, darkened" is a
/// claim about a specific red, and a test that re-resolved `UIColor.systemRed` every run would
/// turn a future palette tweak into a build failure with nothing wrong. Where the *claim* is
/// about the running system — "the platform's own yellow still fails as a mark" — the tests
/// above resolve it live instead.
///
/// Measured on the iOS 26.5 simulator, 6 Aug 2026.
private enum PlatformBaseline {
    static let systemRedLight = "#FF383C"
    static let systemRedDark = "#FF4245"
    static let systemRedLightHighContrast = "#E9152D"
    static let systemYellowDark = "#FFD600"
    static let systemYellowLightHighContrast = "#A16A00"
}

@MainActor
private func systemColor(_ color: UIColor, _ style: UIUserInterfaceStyle) -> UIColor {
    color.resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
}
