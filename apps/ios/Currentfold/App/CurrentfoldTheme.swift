import CurrentfoldBrand
import Observation
import SwiftUI

/// The colors a screen asks for by name, for the cases a view modifier cannot cover.
///
/// Surfaces are not here: a screen never picks its own background, it calls
/// `.currentfoldCanvas()` (`App/BrandControls.swift`), which is what makes the dark-band
/// decision impossible to half-adopt. Everything below resolves to a token in this file, so
/// there is one place a brand value becomes a rendered color and one set of numbers the
/// contrast tests measure.
@MainActor
@Observable
final class CurrentfoldTheme {
    var primaryLabel: Color { Color(uiColor: .label) }
    var secondaryLabel: Color { Color(uiColor: .secondaryLabel) }

    /// The accent as *ink*: link text, tinted controls, bar buttons, and the unread dot.
    /// Resolves per appearance from ``BrandAccentInk``. The accent never appears at full
    /// chroma as ink — see that type for why.
    var accentInk: Color { BrandAccentInk.color }
}

// MARK: - Tokens

/// A brand color in 8-bit sRGB, in whichever notation the consumer needs — a SwiftUI `Color`,
/// a `UIColor`, or the CSS hex the article stylesheet writes.
///
/// Every token in this file is a derivation of a `CurrentfoldBrand` value, and
/// `ArticlePaletteTests` re-derives each one from the brand package, so a token cannot drift
/// from the color it claims to come from.
struct BrandRGB: Sendable, Equatable {
    let red: Int
    let green: Int
    let blue: Int

    var css: String { String(format: "#%02X%02X%02X", red, green, blue) }

    var color: Color {
        Color(
            .sRGB,
            red: Double(red) / 255,
            green: Double(green) / 255,
            blue: Double(blue) / 255,
            opacity: 1
        )
    }

    var uiColor: UIColor {
        UIColor(
            red: CGFloat(red) / 255,
            green: CGFloat(green) / 255,
            blue: CGFloat(blue) / 255,
            alpha: 1
        )
    }

    /// A single color that resolves itself per appearance. `UIColor`'s trait-resolving
    /// initializer rather than an `@Environment(\.colorScheme)` read, so the pair works in
    /// `ButtonStyle` bodies and `UIView` backgrounds too, not only inside a SwiftUI view.
    static func pair(light: BrandRGB, dark: BrandRGB) -> Color {
        Color(
            uiColor: UIColor { traits in
                traits.userInterfaceStyle == .dark ? dark.uiColor : light.uiColor
            }
        )
    }
}

/// The brand accent adjusted for use as *ink* — text, symbols, and the unread dot.
///
/// `brand-identity.md` is explicit that coral identifies rather than sets text: brand
/// `current` (`#EA7558`) measures 2.8:1 on paper, so small coral text — and a 7pt unread dot,
/// which needs 3:1 as a graphical object — misses WCAG on a light canvas. The same section
/// permits "theme-specific darker/lighter interaction tokens where accessibility requires
/// them", which is what ``onLight`` and ``onDark`` are. The web app made the identical call:
/// its `--primary` is a darkened vermilion in light and a lifted coral in dark, and it paints
/// the unread dot with it.
///
/// Full-chroma `current` survives in the interface in exactly one place: ``BrandCTA/fillDark``,
/// where it is a large fill carrying a deep-ink label.
enum BrandAccentInk {
    /// `current` mixed 25% with black: 4.6:1 on brand paper, 4.9:1 on white.
    static let onLight = BrandRGB(red: 176, green: 88, blue: 66)

    /// `current` mixed 20% with white: 7.8:1 on the dark canvas, 7.2:1 on a raised cell. Full
    /// chroma does clear AA on dark, but a saturated orange vibrates against near-black, so
    /// lightness goes up and chroma comes down.
    static let onDark = BrandRGB(red: 238, green: 145, blue: 121)

    static let color = BrandRGB.pair(light: onLight, dark: onDark)
}

/// The two surfaces the app is allowed to paint.
///
/// design-ux.md puts dark surfaces in the `#121212–#1E1E1E` band rather than pure black,
/// because a wall of body text on `#000` halates. iOS's `.systemBackground` is pure black in
/// dark and pure white in light, and brand-identity.md names neither: it names `paper` as the
/// light canvas and `deepInk` as the dark one. So the canvas is the brand's, on every screen —
/// a band adopted on some screens would read as a rendering bug rather than a decision.
///
/// - ``canvas`` is the page: plain lists, the article, launch, and the backdrop of a grouped
///   list. Dark sits at the bottom of the band (`#181512`, luminance of ≈`#151515`).
/// - ``raised`` is one step toward light, for the cells of a grouped list. Dark lands at the
///   *top* of the band (`#201D1A`, the luminance of `#1E1E1E`). Nothing in the app goes above
///   it, which `BrandSurfaceTests` enforces.
enum BrandSurface {
    /// Brand `paper`.
    static let canvasLight = BrandRGB(red: 250, green: 249, blue: 245)
    /// Brand `deepInk`.
    static let canvasDark = BrandRGB(red: 24, green: 21, blue: 18)
    /// `paper` mixed 60% with white — the same relationship the web's `--card` has to its page.
    static let raisedLight = BrandRGB(red: 253, green: 253, blue: 251)
    /// `deepInk` mixed 3.5% with `paper`: as much lift as the top of the band allows.
    static let raisedDark = BrandRGB(red: 32, green: 29, blue: 26)

    static let canvas = BrandRGB.pair(light: canvasLight, dark: canvasDark)
    static let raised = BrandRGB.pair(light: raisedLight, dark: raisedDark)
}

/// The prominent call to action: one fill, one label, decided once for the whole app.
///
/// `.borderedProminent` tinted with full-chroma coral renders a white label at 2.9:1, which is
/// the single worst contrast in the app and appeared on every front-door screen. The fix is
/// not a lighter or heavier label on the same fill — it is deciding fill and label together,
/// per appearance, the way the web app already does:
///
/// - **Light** — the fill darkens (it is ``BrandAccentInk/onLight``, the same value that makes
///   coral legible as text) and carries a `paper` label at 4.6:1. A dark fill with a light
///   label is also what iOS's own prominent buttons look like in light mode.
/// - **Dark** — the fill stays full-chroma `current` and the label goes to `deepInk`, 6.2:1.
///   Darkening the fill instead would sink it into a near-black canvas; lifting the label back
///   to white would put us right back at 2.9:1.
///
/// Pinned in both appearances by `PrimaryActionContrastTests`.
enum BrandCTA {
    static let fillLight = BrandAccentInk.onLight
    /// Brand `current`, unmodified.
    static let fillDark = BrandRGB(red: 234, green: 117, blue: 88)
    /// Brand `paper`.
    static let labelLight = BrandSurface.canvasLight
    /// Brand `deepInk`.
    static let labelDark = BrandSurface.canvasDark

    static let fill = BrandRGB.pair(light: fillLight, dark: fillDark)
    static let label = BrandRGB.pair(light: labelLight, dark: labelDark)
}

// MARK: - Icon vocabulary

/// The read-state icon vocabulary, shared by every control that shows or changes it.
///
/// The web app marks unread with a filled dot and leaves read rows quiet, so iOS uses the
/// SF Symbols circle family for the same metaphor. Deliberately never an envelope: this is
/// a reader, not a mailbox, and mail icons imply a sender and a reply.
enum ReadStateIcon {
    /// A filled dot inside a ring — loud, "there is something here".
    static let unread = "largecircle.fill.circle"
    /// An empty ring — read, and quiet about it.
    static let read = "circle"

    /// One hue for the verb in both directions, matching Mail, where swipe-to-toggle-read is
    /// blue whichever way it is going. The icon and the label carry the direction; a second
    /// hue for the reverse of the same verb would be a fourth color in a swipe palette that
    /// is already at three.
    static let tint = Color.blue

    /// Symbol for a control that *changes* read state. Controls show the state the tap
    /// produces, so the icon previews the dot the row will wear afterwards.
    static func toggle(isRead: Bool) -> String {
        isRead ? unread : read
    }

    /// Title for the same control, phrased as the action it performs.
    static func toggleTitle(isRead: Bool) -> String {
        isRead ? "Mark Unread" : "Mark Read"
    }

    /// Short title for space-constrained controls such as swipe actions.
    static func toggleShortTitle(isRead: Bool) -> String {
        isRead ? "Unread" : "Read"
    }
}

/// The starred-state vocabulary, in ``ReadStateIcon``'s shape.
///
/// A star is the one triage verb with a genuinely universal cross-application symbol *and*
/// color, so this is the single place the reader's palette borrows a system hue: yellow is
/// what a star means everywhere, and relearning it here would be a cost with no benefit. The
/// brand accent stays reserved for unread — the state the product is actually about.
enum StarIcon {
    static let starred = "star.fill"
    static let unstarred = "star"
    static let tint = Color.yellow

    /// Controls show the state the tap produces, matching ``ReadStateIcon``.
    static func toggle(isStarred: Bool) -> String {
        isStarred ? "star.slash" : starred
    }

    static func toggleTitle(isStarred: Bool) -> String {
        isStarred ? "Unstar" : "Star"
    }
}

/// The read-later vocabulary, in ``ReadStateIcon``'s shape.
///
/// A bookmark rather than a flag or a clock: iOS already means "keep this to come back to"
/// with a bookmark, and it stays clearly distinct from the star's "this one mattered".
/// Indigo separates from the star's warm yellow at swipe speed, where color is the whole cue.
/// Removing says **Remove**, matching the web's read-later verb.
enum ReadLaterIcon {
    static let saved = "bookmark.fill"
    static let unsaved = "bookmark"
    static let tint = Color.indigo

    static func toggle(isSaved: Bool) -> String {
        isSaved ? "bookmark.slash" : saved
    }

    static func toggleTitle(isSaved: Bool) -> String {
        isSaved ? "Remove from Read Later" : "Read Later"
    }

    /// Short title for space-constrained controls such as swipe actions.
    static func toggleShortTitle(isSaved: Bool) -> String {
        isSaved ? "Remove" : "Read Later"
    }
}

/// The vocabulary for a saved page — a row in Read Later that came from a URL rather than
/// from a source the reader follows.
///
/// It borrows ``ReadLaterIcon``'s bookmark for Remove on purpose: it is the same verb the
/// reader already knows from an article, phrased the same way, and inventing a trash can for
/// it would say "this is a different, scarier action" when it is the same one. What *is*
/// different is that a saved page has no flag to clear — Remove deletes the page — so the
/// control carries the destructive role and the platform's red instead of read later's
/// indigo. The verb is shared; the weight of it is not.
enum SavedPageIcon {
    /// What tells a saved page apart from an article at a glance, per design-ux.md.
    static let marker = "link"
    static let remove = ReadLaterIcon.toggle(isSaved: true)
    /// The platform's own destructive colour, stated explicitly: a swipe action would
    /// otherwise inherit the app's accent tint, and coral must not double as an alarm.
    static let removeTint = Color.red
    static let retry = "arrow.clockwise"
    static let openOriginal = "safari"

    static let removeTitle = "Remove"
    static let retryTitle = "Retry"
    static let openOriginalTitle = "Open Original"
}

/// How an unread count is allowed to appear.
///
/// design-ux.md's first documented anti-pattern is an exact large unread count, so anything
/// past three digits reads "1k+" instead of a four-digit guilt number. VoiceOver hears the
/// same imprecision rather than the real figure — the cap is the message, not a layout trick.
enum UnreadCountFormat {
    static func label(_ count: Int) -> String {
        count > 999 ? "1k+" : String(count)
    }

    static func accessibilityLabel(_ count: Int) -> String {
        count > 999 ? "More than a thousand unread" : "\(count) unread"
    }
}
