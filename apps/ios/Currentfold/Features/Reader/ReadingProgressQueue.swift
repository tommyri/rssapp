import Foundation

/// Where the reader stopped, waiting to be told to the server.
///
/// The whole design follows from one fact: **a resume position is a convenience, so a write
/// may fail silently, but it may not be silently lost.** Nothing about reading progress is
/// worth an alert in front of a reader — the web says so too — and that is exactly why the
/// value has to survive the failure instead of being fired and forgotten.
///
/// So this is a buffer, not a request builder:
///
/// - **One position per row.** A newer position replaces an older one rather than joining it,
///   which is also how a batch's ids stay distinct — the contract rejects a repeated id rather
///   than resolving it, since two positions for one row contradict each other.
/// - **What the server stored is remembered, not what was sent.** A position equal to the
///   stored one is dropped instead of queued, so opening an article and closing it again
///   writes nothing at all.
/// - **A failed batch goes back**, minus any row the reader has already moved past: the newer
///   position wins and the stale one is dropped rather than re-sent behind it.
struct ReadingProgressQueue: Sendable {
    /// The contract's ceiling for one request.
    static let batchLimit = 100

    /// One flush's worth of work, already split by stream because they are separate endpoints.
    struct Batch: Equatable, Sendable {
        var articles: [APIArticleReadingProgressEntry] = []
        var savedPages: [APISavedPageReadingProgressEntry] = []

        var isEmpty: Bool { articles.isEmpty && savedPages.isEmpty }
    }

    /// Positions waiting to be written.
    ///
    /// The value is itself optional — `nil` means "store nothing to resume from", which is a
    /// value the server has to be told — so every write goes through `updateValue`:
    /// `pending[id] = nil` would *remove* the entry, which is the opposite of queueing it.
    private var pending: [ReaderEntryID: Double?] = [:]

    /// What the server last said it holds for a row, from an echo or from the row itself.
    private var stored: [ReaderEntryID: Double?] = [:]

    var isEmpty: Bool { pending.isEmpty }

    /// The position this row arrived with. Called when a reader opens something, so that
    /// merely opening it — and reporting the position it was restored to — writes nothing.
    mutating func remember(stored progress: Double?, for id: ReaderEntryID) {
        stored.updateValue(progress, forKey: id)
    }

    /// Queues where a reader stopped, normalized the way the server will normalize it.
    mutating func record(_ progress: Double?, for id: ReaderEntryID) {
        if let known = stored[id], known == progress {
            pending.removeValue(forKey: id)
            return
        }
        pending.updateValue(progress, forKey: id)
    }

    /// Drains up to one request's worth of each stream. Anything over the ceiling stays
    /// queued for the next flush rather than being dropped or split into a second request
    /// nothing is waiting for.
    mutating func takeBatch() -> Batch {
        var batch = Batch()
        for (id, progress) in pending.sorted(by: { $0.key.batchOrder < $1.key.batchOrder }) {
            switch id {
            case let .article(articleID):
                guard batch.articles.count < Self.batchLimit else { continue }
                batch.articles.append(
                    APIArticleReadingProgressEntry(
                        articleId: articleID,
                        readingProgress: progress
                    )
                )
            case let .savedPage(savedPageID):
                guard batch.savedPages.count < Self.batchLimit else { continue }
                batch.savedPages.append(
                    APISavedPageReadingProgressEntry(
                        savedPageId: savedPageID,
                        readingProgress: progress
                    )
                )
            }
            pending.removeValue(forKey: id)
        }
        return batch
    }

    /// The server took these and reported what it kept.
    mutating func acknowledge(articles: [APIArticleReadingProgressEntry]) {
        for entry in articles {
            remember(stored: entry.readingProgress, for: .article(entry.articleId))
        }
    }

    mutating func acknowledge(savedPages: [APISavedPageReadingProgressEntry]) {
        for entry in savedPages {
            remember(stored: entry.readingProgress, for: .savedPage(entry.savedPageId))
        }
    }

    /// A write failed. The positions go back so the next flush retries them.
    mutating func requeue(articles: [APIArticleReadingProgressEntry]) {
        for entry in articles {
            requeue(entry.readingProgress, for: .article(entry.articleId))
        }
    }

    mutating func requeue(savedPages: [APISavedPageReadingProgressEntry]) {
        for entry in savedPages {
            requeue(entry.readingProgress, for: .savedPage(entry.savedPageId))
        }
    }

    /// The stale position only goes back if the reader has not queued a newer one while the
    /// failed request was in flight — otherwise the retry would walk them backwards.
    private mutating func requeue(_ progress: Double?, for id: ReaderEntryID) {
        guard !pending.keys.contains(id) else { return }
        pending.updateValue(progress, forKey: id)
    }
}

private extension ReaderEntryID {
    /// A deterministic drain order. Nothing depends on *which* order the batch comes out in,
    /// only that two runs agree — a dictionary's iteration order does not.
    var batchOrder: String {
        switch self {
        case let .article(id): "a:\(id)"
        case let .savedPage(id): "s:\(id)"
        }
    }
}
