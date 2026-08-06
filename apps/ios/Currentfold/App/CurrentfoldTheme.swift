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
    /// Not `.secondaryLabel` — see ``BrandSecondaryInk`` for the measurement that retired it.
    var secondaryLabel: Color { BrandSecondaryInk.color }

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
    ///
    /// The high-contrast values are optional because most tokens do not need them: a token
    /// that replaces a *system* color has to keep answering Increase Contrast the way the
    /// color it replaced did, and a token that is already far past its floor does not.
    static func pair(
        light: BrandRGB,
        dark: BrandRGB,
        highContrastLight: BrandRGB? = nil,
        highContrastDark: BrandRGB? = nil
    ) -> Color {
        Color(
            uiColor: UIColor { traits in
                let wantsContrast = traits.accessibilityContrast == .high
                if traits.userInterfaceStyle == .dark {
                    return (wantsContrast ? highContrastDark ?? dark : dark).uiColor
                }
                return (wantsContrast ? highContrastLight ?? light : light).uiColor
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

/// Muted text — previews, meta lines, footers, taglines, status lines — as brand `stone`
/// rather than the platform's `.secondaryLabel`.
///
/// `.secondaryLabel` is 60%-alpha `#3C3C43`, which composites to **3.4:1** on our light
/// canvas: below AA for text that is genuinely content (a snippet, a date, a reading
/// estimate). Apple's own apps sit at roughly that number on their own white, so this is
/// platform behaviour rather than a bug — but the article web view already sets its muted text
/// in brand `stone` at 4.6:1, so keeping `.secondaryLabel` in the chrome meant the same
/// sentence was legible inside the reader and not outside it.
///
/// brand-identity.md names `stone` "secondary brand material and muted metadata", and it
/// clears AA on both light surfaces without touching the hierarchy: primary label is ~19.9:1
/// on paper, so a 4.6:1 secondary is still, visibly, a step down.
///
/// Values are `ArticlePalette.mutedLight`/`mutedDark` — one muted ink for the whole product.
///
/// **Increase Contrast is answered**, because the color this replaces answered it: the system
/// darkens `.secondaryLabel` when the setting is on, and a static token would have silently
/// stopped doing that for the reader who asked for help most explicitly.
enum BrandSecondaryInk {
    /// Brand `stone`: 4.6:1 on paper, 4.7:1 on a raised cell.
    static let onLight = BrandRGB(red: 120, green: 113, blue: 108)
    /// `stone` lightened 30% toward white: 6.7:1 on the dark canvas, 6.2:1 on a raised cell.
    static let onDark = BrandRGB(red: 160, green: 156, blue: 152)
    /// `stone` mixed 40% with brand `ink`: 7.8:1 on paper.
    static let onLightHighContrast = BrandRGB(red: 83, green: 78, blue: 74)
    /// ``onDark`` mixed 40% with brand `paper`: 10.1:1 on the dark canvas.
    static let onDarkHighContrast = BrandRGB(red: 196, green: 193, blue: 189)

    static let color = BrandRGB.pair(
        light: onLight,
        dark: onDark,
        highContrastLight: onLightHighContrast,
        highContrastDark: onDarkHighContrast
    )
}

/// Error text, as the platform's red where it clears AA and a darkened red where it does not.
///
/// `UIColor.systemRed` in light is `#FF383C`, which measures **3.4:1** on brand paper — the
/// same value on the platform's own white, so nothing is broken; it simply misses the floor
/// this app holds, and it lands on the sentence that tells a reader why they could not sign
/// in. In dark, `#FF4245` measures 5.3:1 on the canvas and 4.9:1 on a raised cell, so there is
/// nothing to fix and the token is the platform's own value: a floor token exists to hold the
/// floor, not to repaint a color that already clears it.
///
/// No Increase Contrast variant, unlike ``BrandSecondaryInk``, and this is measured rather than
/// assumed: the platform's own high-contrast red (`#E9152D`) is **4.3:1** on paper — still
/// under the floor, and weaker than this token's ordinary 5.6:1. There is nothing to switch to.
///
/// Only *text* uses this. A destructive **fill** — a swipe action, a `.destructive` role — is a
/// non-text object at a 3:1 floor, which the platform's red clears in both appearances; those
/// keep `Color.red`, because the platform owns the meaning of that surface.
enum BrandErrorInk {
    /// The platform's light `systemRed` mixed 25% with black, matching ``BrandAccentInk``'s
    /// own derivation: 5.6:1 on paper, 5.8:1 on a raised cell.
    static let onLight = BrandRGB(red: 191, green: 42, blue: 45)
    /// The platform's dark `systemRed`, unmodified: 5.3:1 on the canvas, 4.9:1 raised.
    static let onDark = BrandRGB(red: 255, green: 66, blue: 69)

    static let color = BrandRGB.pair(light: onLight, dark: onDark)
}

/// The star's yellow, deepened for light.
///
/// A row's star is the only thing that says an article is starred, which makes it a graphical
/// object at WCAG's 3:1 floor — and `systemYellow` `#FFCC00` measures **1.4:1** on paper. It
/// was the weakest mark in the app by a wide margin, and at `.caption2` it is also the
/// smallest. Dark needs no help: `#FFD600` is 12.9:1 on the canvas.
///
/// The light value is not invented: it is `systemYellow` as the platform itself resolves it
/// under **Increase Contrast** (`#A16A00`), adopted as our ordinary value because our canvas
/// needs it all the time. Apple's answer to "this yellow is too light to mean anything" is a
/// deep gold, and borrowing it keeps the star recognisably the system's colour rather than a
/// hue this app made up. It measures 4.4:1 on paper and 4.5:1 on a raised cell.
///
/// One value per appearance for the whole verb, so the swipe action moves with the marker
/// rather than keeping a yellow the row no longer uses.
enum BrandStarInk {
    /// `systemYellow` as the platform resolves it under Increase Contrast, light.
    static let onLight = BrandRGB(red: 161, green: 106, blue: 0)
    /// The platform's dark `systemYellow`, unmodified: 12.9:1 on the canvas, 11.9:1 raised.
    static let onDark = BrandRGB(red: 255, green: 214, blue: 0)

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
    /// ``BrandStarInk``, not `Color.yellow`: the system's yellow is 1.4:1 on paper and a row
    /// marker has to clear 3:1. Dark keeps the platform's value.
    static let tint = BrandStarInk.color

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
