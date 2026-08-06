import Foundation

/// The client half of the unified Read Later queue: two newest-first streams, one order.
///
/// Read later is deliberately one queue and deliberately two streams on the wire
/// (docs/first-party-api.md): flagged articles sort by publication, saved pages sort by save
/// time. They genuinely sort by different columns, so nothing but the client can interleave
/// them, and this is where that happens.
///
/// **The invariant is one sentence: a row is emitted only once no unfetched row could sort
/// above it.** With both streams newest-first, that means a stream's head may be consumed
/// while the other stream either has a head to compare it against, or has finished entirely.
/// Everything else falls out of it — how far the visible list can run, which stream the next
/// page has to come from, and why a page is never fetched from a stream that still has
/// unemitted rows in hand. That last part is the whole reason the buffers exist: each stream
/// is at most one page ahead of what the reader can see, never two.
///
/// An ordinary article list is the degenerate case — one stream, the other empty and finished
/// before it starts — so every list in the app pages through this same code rather than
/// through a second, subtly different implementation.
struct ReaderEntryMerge: Equatable, Sendable {
    /// One row's place in the order: which id, and the instant it sorts by.
    struct Item: Equatable, Sendable {
        let id: String
        /// `nil` when the contract's timestamp did not parse. It sorts *last* rather than
        /// jumping to the top of someone's queue.
        let date: Date?
    }

    /// One newest-first stream: what has been fetched but not yet emitted, and where to
    /// resume.
    struct Stream: Equatable, Sendable {
        /// Fetched, in server order, not yet emitted. Never more than one page's worth,
        /// because a page is only ever asked for when this is empty.
        var buffered: [Item] = []
        /// Where to resume. `nil` once the stream has answered its last page.
        var cursor: String?
        /// Before the first page lands a `nil` cursor means "start at the top", not
        /// "finished" — which is the whole reason this flag exists.
        var hasLoaded = false

        var isFinished: Bool { hasLoaded && cursor == nil }

        /// A stream that is over before it begins: what the saved-page half of an ordinary
        /// article list looks like.
        static let finished = Stream(buffered: [], cursor: nil, hasLoaded: true)
    }

    /// Whether this list folds saved pages in at all. Fixed for the life of the merge; a
    /// filter switch builds a new one.
    let includesSavedPages: Bool

    /// The emitted order — the list the reader sees.
    private(set) var entryIDs: [ReaderEntryID] = []
    private(set) var articles = Stream()
    private(set) var savedPages = Stream()

    private var emitted: Set<ReaderEntryID> = []

    init(includesSavedPages: Bool) {
        self.includesSavedPages = includesSavedPages
        savedPages = includesSavedPages ? Stream() : .finished
    }

    // MARK: - Reading

    var lastEntryID: ReaderEntryID? { entryIDs.last }

    /// True when the article stream is what is holding the queue up.
    var needsArticlePage: Bool { articles.buffered.isEmpty && !articles.isFinished }

    var needsSavedPagePage: Bool { savedPages.buffered.isEmpty && !savedPages.isFinished }

    var canLoadMore: Bool { needsArticlePage || needsSavedPagePage }

    // MARK: - Writing

    mutating func acceptArticles(_ items: [Item], nextCursor: String?) {
        accept(items, nextCursor: nextCursor, into: \.articles, as: ReaderEntryID.article)
    }

    mutating func acceptSavedPages(_ items: [Item], nextCursor: String?) {
        accept(items, nextCursor: nextCursor, into: \.savedPages, as: ReaderEntryID.savedPage)
    }

    /// A stream can repeat a row across pages — a keyset cursor sits between rows, and rows
    /// move — so an id already emitted or already in hand is dropped rather than shown twice.
    private mutating func accept(
        _ items: [Item],
        nextCursor: String?,
        into stream: WritableKeyPath<ReaderEntryMerge, Stream>,
        as identify: (String) -> ReaderEntryID
    ) {
        var known = Set(self[keyPath: stream].buffered.map(\.id))
        let fresh = items.filter { item in
            guard !known.contains(item.id), !emitted.contains(identify(item.id)) else {
                return false
            }
            known.insert(item.id)
            return true
        }
        self[keyPath: stream].buffered.append(contentsOf: fresh)
        self[keyPath: stream].cursor = nextCursor
        self[keyPath: stream].hasLoaded = true
        drain()
    }

    /// Emits every row the invariant allows, and stops at the first one it does not.
    private mutating func drain() {
        while true {
            switch (articles.buffered.first, savedPages.buffered.first) {
            case (nil, nil):
                return
            case let (.some(article), nil):
                guard savedPages.isFinished else { return }
                emitArticle(article)
            case let (nil, .some(page)):
                guard articles.isFinished else { return }
                emitSavedPage(page)
            case let (.some(article), .some(page)):
                if isNewer(article, than: page) {
                    emitArticle(article)
                } else {
                    emitSavedPage(page)
                }
            }
        }
    }

    /// Ties and unreadable timestamps resolve toward the article, so the order a reader sees
    /// is a function of the data and of nothing else.
    private func isNewer(_ article: Item, than page: Item) -> Bool {
        (article.date ?? .distantPast) >= (page.date ?? .distantPast)
    }

    private mutating func emitArticle(_ item: Item) {
        articles.buffered.removeFirst()
        emit(.article(item.id))
    }

    private mutating func emitSavedPage(_ item: Item) {
        savedPages.buffered.removeFirst()
        emit(.savedPage(item.id))
    }

    private mutating func emit(_ id: ReaderEntryID) {
        entryIDs.append(id)
        emitted.insert(id)
    }
}
