import Foundation
import Observation

/// The reading screen's half of progress sync: the live fraction the bar draws, and when the
/// queued positions are actually written.
///
/// The *timing* lives here rather than in the store because it is a property of a screen —
/// "a moment after the scrolling settles", "when this closes", "when the app goes away" — while
/// the queue is a property of the session. Both reading screens share this one object so an
/// article and a saved page cannot end up with different rules.
///
/// The throttle is a ceiling, not a delay: the first movement starts the clock and later
/// movements ride it, so a continuous scroll produces one write every ``writeAfter`` seconds
/// rather than one per frame or one long-postponed write at the end.
@MainActor
@Observable
final class ReadingProgressTracker {
    /// The web reader uses the same 1.5s, for the same reason: a position is worth a request,
    /// but not one per scroll event.
    static let writeAfter: Duration = .seconds(1.5)

    private(set) var progress: Double = 0

    @ObservationIgnored private var scheduled: Task<Void, Never>?

    /// A reading screen opened. The bar starts at the position the copy is about to be
    /// restored to, rather than at zero — a reader resumed two thirds of the way through an
    /// article should not be told they are at the beginning of it.
    ///
    /// Deliberately not a `report`: this is where the reader already was, so it is not news
    /// for the server and must not become a write.
    func begin(at resumed: Double?) {
        progress = resumed ?? 0
    }

    /// A new scroll position. Cheap: it updates the bar and queues the value, and only starts
    /// a write if one is not already on the clock.
    func report(_ value: Double, for id: ReaderEntryID, to store: ReaderStore) {
        progress = value
        store.recordReadingProgress(value, for: id)
        guard scheduled == nil else { return }
        scheduled = Task { [weak self] in
            try? await Task.sleep(for: Self.writeAfter)
            guard !Task.isCancelled else { return }
            self?.scheduled = nil
            await store.flushReadingProgress()
        }
    }

    /// The reading screen is closing, or the app is leaving the foreground. Writes now instead
    /// of waiting out the throttle — this is the flush that matters, because there may not be
    /// another one.
    func flush(to store: ReaderStore) {
        scheduled?.cancel()
        scheduled = nil
        Task { await store.flushReadingProgress() }
    }
}
