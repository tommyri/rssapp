import Foundation

/// How the article body is set: the same three choices the web's Settings → Reading offers,
/// expressed for a phone.
///
/// **Text size is an adjustment, never a replacement.** The document's base size is
/// `-apple-system-body`, so the reader's Dynamic Type setting still decides what "normal"
/// means; these values multiply it. A reader at accessibility XXL who also picks Large gets
/// both, and a reader who never opens this control gets exactly what the app shipped before it
/// existed.
struct ReadingTypography: Equatable, Sendable {
    var size: ReadingTextSize = .medium
    var font: ReadingBodyFont = .sans
    var width: ReadingColumnWidth = .normal

    static let `default` = ReadingTypography()
}

enum ReadingTextSize: String, CaseIterable, Identifiable, Sendable {
    case small
    case medium
    case large

    var id: String { rawValue }

    var title: String {
        switch self {
        case .small: "Small"
        case .medium: "Medium"
        case .large: "Large"
        }
    }

    /// A multiplier on top of Dynamic Type, in the web's own steps (its three sizes are
    /// 0.9375/1.0625/1.25rem, which is −12% / 0 / +18%).
    var scale: Double {
        switch self {
        case .small: 0.88
        case .medium: 1
        case .large: 1.18
        }
    }
}

enum ReadingBodyFont: String, CaseIterable, Identifiable, Sendable {
    case sans
    case serif

    var id: String { rawValue }

    var title: String {
        switch self {
        case .sans: "Sans"
        case .serif: "Serif"
        }
    }

    /// `ui-serif` is New York, the same face `design: .serif` gives the article title, so a
    /// reader who chooses Serif gets one typeface down the whole screen rather than two.
    var cssFamily: String {
        switch self {
        case .sans: "-apple-system, system-ui, sans-serif"
        case .serif: "ui-serif, \"New York\", Georgia, serif"
        }
    }
}

/// Column width, which on a phone is a margin rather than a measure.
///
/// The web sets 52/65/78 `ch` maxima. At an iPhone's width none of them bind — 52ch is already
/// wider than the screen — so a control that only set them would visibly do nothing. Each
/// option therefore carries a side inset, which is what the reader actually sees, *and* the
/// web's ceiling, which takes over on an iPad or in landscape where there is room to spare.
enum ReadingColumnWidth: String, CaseIterable, Identifiable, Sendable {
    case narrow
    case normal
    case wide

    var id: String { rawValue }

    var title: String {
        switch self {
        case .narrow: "Narrow"
        case .normal: "Normal"
        case .wide: "Wide"
        }
    }

    /// Points of breathing room on each side. `normal` is the value the article has always
    /// had, so the default changes nothing.
    var sideInset: Int {
        switch self {
        case .narrow: 38
        case .normal: 18
        case .wide: 10
        }
    }

    /// Characters, matching the web, for the windows wide enough to be limited by it.
    var measure: Int {
        switch self {
        case .narrow: 52
        case .normal: 65
        case .wide: 78
        }
    }
}
