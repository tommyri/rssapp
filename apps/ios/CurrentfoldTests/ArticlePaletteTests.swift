import CurrentfoldBrand
import SwiftUI
import UIKit
import XCTest
@testable import Currentfold

/// Guards the article stylesheet's palette: the link colors must stay derivations of the
/// single `CurrentfoldBrand` accent, and every text color must stay legible in the
/// appearance it belongs to.
@MainActor
final class ArticlePaletteTests: XCTestCase {
    /// The surfaces the article actually lands on, taken from the theme rather than assumed:
    /// the canvas in light, and the *raised* surface in dark, which is the lightest thing any
    /// dark-appearance text sits on and therefore the worst case.
    private let paper = RGB(BrandSurface.canvasLight)
    private let darkSurface = RGB(BrandSurface.raisedDark)

    func testLinkColorsAreDerivedFromTheBrandAccent() {
        let accent = RGB(CurrentfoldBrand.current)

        assertSameColor(
            RGB(hex: ArticlePalette.linkLight),
            accent.mixed(with: .black, amount: 0.25)
        )
        assertSameColor(
            RGB(hex: ArticlePalette.linkDark),
            accent.mixed(with: .white, amount: 0.20)
        )
    }

    /// A link has to look the same inside the web view and out, and the accent token exists
    /// in three notations (CSS, `Color`, `UIColor`) — this is where they could drift apart.
    func testAccentInkIsTheSameColorInEveryNotation() {
        assertSameColor(RGB(BrandAccentInk.onLight.color), RGB(hex: ArticlePalette.linkLight))
        assertSameColor(RGB(BrandAccentInk.onDark.color), RGB(hex: ArticlePalette.linkDark))

        let dynamicInk = UIColor(CurrentfoldTheme().accentInk)
        assertSameColor(
            RGB(dynamicInk.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))),
            RGB(hex: ArticlePalette.linkLight)
        )
        assertSameColor(
            RGB(dynamicInk.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))),
            RGB(hex: ArticlePalette.linkDark)
        )
    }

    func testTextColorsClearWCAGAAAgainstTheirAppearance() {
        let lightText = [
            ArticlePalette.bodyLight,
            ArticlePalette.linkLight,
            ArticlePalette.mutedLight,
        ]
        for hex in lightText {
            XCTAssertGreaterThanOrEqual(RGB(hex: hex).contrast(with: paper), 4.5, hex)
        }

        let darkText = [
            ArticlePalette.bodyDark,
            ArticlePalette.linkDark,
            ArticlePalette.mutedDark,
        ]
        for hex in darkText {
            XCTAssertGreaterThanOrEqual(RGB(hex: hex).contrast(with: darkSurface), 4.5, hex)
        }
    }
}

/// Guards the two surfaces the app is allowed to paint.
///
/// The app deliberately does not use `.systemBackground`, which is pure black in dark mode:
/// design-ux.md puts dark surfaces in the `#121212–#1E1E1E` halation band and
/// brand-identity.md names `paper` and `deepInk` as the two canvases. Both halves of that
/// decision are measured here, because a canvas is the one color a screen can silently stop
/// applying.
@MainActor
final class BrandSurfaceTests: XCTestCase {
    func testSurfacesAreDerivedFromTheBrandCanvasColors() {
        let paper = RGB(CurrentfoldBrand.paper)
        let deepInk = RGB(CurrentfoldBrand.deepInk)

        assertSameColor(RGB(BrandSurface.canvasLight), paper)
        assertSameColor(RGB(BrandSurface.canvasDark), deepInk)
        assertSameColor(RGB(BrandSurface.raisedLight), paper.mixed(with: .white, amount: 0.60))
        assertSameColor(RGB(BrandSurface.raisedDark), deepInk.mixed(with: paper, amount: 0.035))
    }

    /// The band is the whole point of the decision: the canvas sits at its floor and the one
    /// raised surface at its ceiling, so no screen can drift to pure black or past `#1E1E1E`.
    func testEveryDarkSurfaceStaysInsideTheHalationBand() {
        let floor = RGB(hex: "#121212").relativeLuminance
        let ceiling = RGB(hex: "#1E1E1E").relativeLuminance

        for surface in [BrandSurface.canvasDark, BrandSurface.raisedDark] {
            let luminance = RGB(surface).relativeLuminance
            XCTAssertGreaterThanOrEqual(luminance, floor, surface.css)
            XCTAssertLessThanOrEqual(luminance, ceiling, surface.css)
        }
    }

    /// Light and dark are one system: a raised cell is a step *toward light* in both
    /// appearances, never a step down.
    func testRaisedSurfacesAreLighterThanTheCanvasInBothAppearances() {
        XCTAssertGreaterThan(
            RGB(BrandSurface.raisedLight).relativeLuminance,
            RGB(BrandSurface.canvasLight).relativeLuminance
        )
        XCTAssertGreaterThan(
            RGB(BrandSurface.raisedDark).relativeLuminance,
            RGB(BrandSurface.canvasDark).relativeLuminance
        )
    }

    /// The accent is ink on both surfaces of both appearances — link text, bar buttons, and the
    /// unread dot all resolve to it, so it has to clear AA everywhere, not only on the canvas.
    func testTheAccentClearsWCAGAAAsInkOnEverySurfaceItLandsOn() {
        let onLight = RGB(BrandAccentInk.onLight)
        let onDark = RGB(BrandAccentInk.onDark)

        for surface in [BrandSurface.canvasLight, BrandSurface.raisedLight] {
            XCTAssertGreaterThanOrEqual(onLight.contrast(with: RGB(surface)), 4.5, surface.css)
        }
        for surface in [BrandSurface.canvasDark, BrandSurface.raisedDark] {
            XCTAssertGreaterThanOrEqual(onDark.contrast(with: RGB(surface)), 4.5, surface.css)
        }
    }

    /// The dynamic `Color` is what a view actually paints; these are the numbers above.
    func testTheDynamicCanvasResolvesToTheMeasuredValues() {
        assertSameColor(resolved(BrandSurface.canvas, .light), RGB(BrandSurface.canvasLight))
        assertSameColor(resolved(BrandSurface.canvas, .dark), RGB(BrandSurface.canvasDark))
        assertSameColor(resolved(BrandSurface.raised, .light), RGB(BrandSurface.raisedLight))
        assertSameColor(resolved(BrandSurface.raised, .dark), RGB(BrandSurface.raisedDark))
    }
}

/// Guards the app's single prominent control treatment.
///
/// `.borderedProminent` tinted with full-chroma coral put a white label on the accent at
/// 2.9:1 — the worst contrast in the app, on Sign In, Create Account, Send Reset Link, Try
/// Again, and every empty-state action. The fix was to decide fill and label together per
/// appearance (``BrandCTA``); this is what stops the next tint from undoing it.
@MainActor
final class PrimaryActionContrastTests: XCTestCase {
    func testTheFillAndLabelAreDerivedFromBrandTokens() {
        assertSameColor(RGB(BrandCTA.fillDark), RGB(CurrentfoldBrand.current))
        assertSameColor(
            RGB(BrandCTA.fillLight),
            RGB(CurrentfoldBrand.current).mixed(with: .black, amount: 0.25)
        )
        assertSameColor(RGB(BrandCTA.labelLight), RGB(CurrentfoldBrand.paper))
        assertSameColor(RGB(BrandCTA.labelDark), RGB(CurrentfoldBrand.deepInk))
    }

    func testTheLabelClearsWCAGAAOnItsFillInBothAppearances() {
        XCTAssertGreaterThanOrEqual(
            RGB(BrandCTA.labelLight).contrast(with: RGB(BrandCTA.fillLight)),
            4.5
        )
        XCTAssertGreaterThanOrEqual(
            RGB(BrandCTA.labelDark).contrast(with: RGB(BrandCTA.fillDark)),
            4.5
        )
    }

    /// WCAG 1.4.11: a filled control also has to be findable against the page it sits on.
    func testTheFillStandsOffTheCanvasInBothAppearances() {
        XCTAssertGreaterThanOrEqual(
            RGB(BrandCTA.fillLight).contrast(with: RGB(BrandSurface.canvasLight)),
            3
        )
        XCTAssertGreaterThanOrEqual(
            RGB(BrandCTA.fillDark).contrast(with: RGB(BrandSurface.canvasDark)),
            3
        )
    }

    /// The arrangement this treatment replaced, kept as a measurement so nobody reintroduces
    /// it by "just tinting the button with the brand color".
    func testAWhiteLabelOnFullChromaCoralStillFails() {
        XCTAssertLessThan(RGB.white.contrast(with: RGB(CurrentfoldBrand.current)), 3.0)
    }

    /// `PrimaryActionButtonStyle` paints the dynamic colors, not the per-appearance ones.
    func testTheRenderedStyleResolvesToTheMeasuredValues() {
        assertSameColor(resolved(BrandCTA.fill, .light), RGB(BrandCTA.fillLight))
        assertSameColor(resolved(BrandCTA.fill, .dark), RGB(BrandCTA.fillDark))
        assertSameColor(resolved(BrandCTA.label, .light), RGB(BrandCTA.labelLight))
        assertSameColor(resolved(BrandCTA.label, .dark), RGB(BrandCTA.labelDark))
    }
}

@MainActor
func resolved(
    _ color: Color,
    _ style: UIUserInterfaceStyle,
    contrast: UIAccessibilityContrast = .normal
) -> RGB {
    let traits = UITraitCollection { mutable in
        mutable.userInterfaceStyle = style
        mutable.accessibilityContrast = contrast
    }
    return RGB(UIColor(color).resolvedColor(with: traits))
}

func assertSameColor(
    _ actual: RGB,
    _ expected: RGB,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    let tolerance = 1.0 / 255
    XCTAssertEqual(actual.red, expected.red, accuracy: tolerance, file: file, line: line)
    XCTAssertEqual(actual.green, expected.green, accuracy: tolerance, file: file, line: line)
    XCTAssertEqual(actual.blue, expected.blue, accuracy: tolerance, file: file, line: line)
}

/// Displayed unread counts are the reader's stress surface, so the cap is pinned rather than
/// left to whoever next touches a row.
final class UnreadCountFormatTests: XCTestCase {
    func testCountsPastThreeDigitsNeverShowAnExactNumber() {
        XCTAssertEqual(UnreadCountFormat.label(0), "0")
        XCTAssertEqual(UnreadCountFormat.label(999), "999")
        XCTAssertEqual(UnreadCountFormat.label(1000), "1k+")
        XCTAssertEqual(UnreadCountFormat.label(2431), "1k+")
    }

    func testVoiceOverHearsTheSameImprecision() {
        XCTAssertEqual(UnreadCountFormat.accessibilityLabel(4), "4 unread")
        XCTAssertEqual(
            UnreadCountFormat.accessibilityLabel(2431),
            "More than a thousand unread"
        )
    }
}

struct RGB {
    static let black = RGB(red: 0, green: 0, blue: 0)
    static let white = RGB(red: 1, green: 1, blue: 1)

    let red: Double
    let green: Double
    let blue: Double

    init(red: Double, green: Double, blue: Double) {
        self.red = red
        self.green = green
        self.blue = blue
    }

    init(hex: String) {
        let value = UInt32(hex.dropFirst(), radix: 16) ?? 0
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    init(_ brand: BrandRGB) {
        self.init(
            red: Double(brand.red) / 255,
            green: Double(brand.green) / 255,
            blue: Double(brand.blue) / 255
        )
    }

    init(_ uiColor: UIColor) {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        self.init(red: Double(red), green: Double(green), blue: Double(blue))
    }

    /// The platform's label and separator colours are partly transparent, so what a reader
    /// actually sees is the composite over whatever surface is behind them — which, in this
    /// app, is never the surface those colours were tuned against.
    init(_ uiColor: UIColor, over background: RGB) {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        uiColor.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        let opacity = Double(alpha)
        self.init(
            red: Double(red) * opacity + background.red * (1 - opacity),
            green: Double(green) * opacity + background.green * (1 - opacity),
            blue: Double(blue) * opacity + background.blue * (1 - opacity)
        )
    }

    @MainActor
    init(_ color: Color) {
        self.init(UIColor(color))
    }

    func mixed(with other: RGB, amount: Double) -> RGB {
        RGB(
            red: red + (other.red - red) * amount,
            green: green + (other.green - green) * amount,
            blue: blue + (other.blue - blue) * amount
        )
    }

    /// WCAG 2.1 contrast ratio.
    func contrast(with other: RGB) -> Double {
        let lighter = max(relativeLuminance, other.relativeLuminance)
        let darker = min(relativeLuminance, other.relativeLuminance)
        return (lighter + 0.05) / (darker + 0.05)
    }

    var relativeLuminance: Double {
        func channel(_ value: Double) -> Double {
            value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    }
}
