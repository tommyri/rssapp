import Foundation

/// The overload valve, in the three sizes design-ux.md calls for.
enum MarkAllReadSweep: String, CaseIterable, Identifiable {
    case everything
    case olderThanADay
    case olderThanAWeek

    var id: String { rawValue }

    var menuTitle: String {
        switch self {
        case .everything: "Mark All Read"
        case .olderThanADay: "Older Than a Day"
        case .olderThanAWeek: "Older Than a Week"
        }
    }

    var commitTitle: String {
        switch self {
        case .everything: "Mark All Read"
        case .olderThanADay: "Mark Older Than a Day"
        case .olderThanAWeek: "Mark Older Than a Week"
        }
    }

    func confirmationTitle(scope: String) -> String {
        switch self {
        case .everything: "Mark everything in \(scope) read?"
        case .olderThanADay: "Mark \(scope) older than a day read?"
        case .olderThanAWeek: "Mark \(scope) older than a week read?"
        }
    }

    /// States exactly what the sweep reaches: the scope, not the list, and including rows this
    /// view has not shown — whether because they are further down or filtered out.
    func explanation(scope: String) -> String {
        switch self {
        case .everything:
            "Marks every unread article in \(scope) read, including ones this list isn’t showing."
        case .olderThanADay:
            "Marks unread articles in \(scope) from more than a day ago read, including ones "
                + "this list isn’t showing. Anything newer stays unread."
        case .olderThanAWeek:
            "Marks unread articles in \(scope) from more than a week ago read, including ones "
                + "this list isn’t showing. Anything newer stays unread."
        }
    }

    /// Resolved at commit time, not when the menu opened.
    func cutoff(now: Date = .now) -> Date? {
        switch self {
        case .everything: nil
        case .olderThanADay: now.addingTimeInterval(-86_400)
        case .olderThanAWeek: now.addingTimeInterval(-604_800)
        }
    }

    static func receipt(markedCount: Int) -> String {
        switch markedCount {
        case 0: "Nothing left to mark read"
        case 1: "1 article marked read"
        default: "\(markedCount) articles marked read"
        }
    }
}
