import Foundation
@testable import Currentfold

/// Scripted article pages, plus a log of every request the store actually made. Keyed by the
/// full request identity so a test can assert that switching views asked the server a
/// different question rather than filtering the answer on the client.
actor ArticleFeed {
    struct Key: Hashable, Sendable {
        let scope: ArticleListScope
        let filter: ArticleFilter
        let cursor: String?

        init(scope: ArticleListScope = .library, filter: ArticleFilter, cursor: String? = nil) {
            self.scope = scope
            self.filter = filter
            self.cursor = cursor
        }
    }

    private var pages: [Key: APIArticlePage] = [:]
    private var log: [Key] = []
    private var failure: CurrentfoldAPIError?

    func stub(_ key: Key, _ articles: [APIArticle], nextCursor: String? = nil) {
        pages[key] = APIArticlePage(
            data: articles,
            pagination: .init(nextCursor: nextCursor)
        )
    }

    func failEveryRequest(with error: CurrentfoldAPIError) {
        failure = error
    }

    func page(query: ArticleQuery, cursor: String?) throws -> APIArticlePage {
        let key = Key(scope: query.scope, filter: query.filter, cursor: cursor)
        log.append(key)
        if let failure {
            throw failure
        }
        return pages[key] ?? APIArticlePage(data: [], pagination: .init(nextCursor: nil))
    }

    func requests() -> [Key] {
        log
    }
}

/// Every batched state mutation the store committed, and which verbs the server refuses.
actor TriageLog {
    enum Verb: String, Sendable {
        case read
        case starred
        case readLater
    }

    struct Update: Sendable, Equatable {
        let verb: Verb
        let articleIDs: [String]
        let value: Bool
    }

    static let refusal = CurrentfoldAPIError.rejected(
        status: 500,
        code: nil,
        message: "Currentfold couldn’t save that."
    )

    private var updates: [Update] = []
    private var refusedVerbs: Set<Verb> = []

    func refuse(_ verb: Verb) {
        refusedVerbs.insert(verb)
    }

    func record(_ verb: Verb, _ articleIDs: [String], _ value: Bool) throws {
        updates.append(Update(verb: verb, articleIDs: articleIDs, value: value))
        if refusedVerbs.contains(verb) {
            throw Self.refusal
        }
    }

    func recorded() -> [Update] {
        updates
    }
}

/// Mark-all-read requests, and the count the server reports back.
actor SweepLog {
    private var requests: [APIMarkAllReadRequest] = []
    private var markedCount = 0
    private var failure: CurrentfoldAPIError?

    func report(markedCount: Int) {
        self.markedCount = markedCount
    }

    func failEveryRequest(with error: CurrentfoldAPIError) {
        failure = error
    }

    func run(_ request: APIMarkAllReadRequest) throws -> APIMarkAllReadResult {
        requests.append(request)
        if let failure {
            throw failure
        }
        return APIMarkAllReadResult(
            scope: request.scope,
            subscriptionId: request.subscriptionId,
            folderId: request.folderId,
            olderThan: request.olderThan,
            markedCount: markedCount
        )
    }

    func recorded() -> [APIMarkAllReadRequest] {
        requests
    }
}

/// Hands out one subscription snapshot per fetch, so a test can prove that a sweep refreshed
/// the Sources counts rather than leaving stale ones on screen.
actor SubscriptionSource {
    private var snapshots: [[APISubscription]]
    private var fetchCount = 0

    init(_ snapshots: [[APISubscription]]) {
        self.snapshots = snapshots
    }

    func next() -> [APISubscription] {
        fetchCount += 1
        guard snapshots.count > 1 else { return snapshots.first ?? [] }
        return snapshots.removeFirst()
    }

    func fetches() -> Int {
        fetchCount
    }
}

/// Lets a test hold one request open while it makes another, which is the only way to prove
/// that a slow answer cannot land on top of a newer one.
actor Gate {
    private var arrivals: [CheckedContinuation<Void, Never>] = []
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var hasArrived = false
    private var isReleased = false

    /// Called from inside the stubbed request: announces it started.
    func arrive() {
        hasArrived = true
        for continuation in arrivals {
            continuation.resume()
        }
        arrivals = []
    }

    /// Called from inside the stubbed request: suspends until the test releases it.
    func waitForRelease() async {
        guard !isReleased else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func started() async {
        guard !hasArrived else { return }
        await withCheckedContinuation { arrivals.append($0) }
    }

    func release() {
        isReleased = true
        for continuation in waiters {
            continuation.resume()
        }
        waiters = []
    }
}

@MainActor
enum ReaderTestStore {
    /// A store wired to the doubles above. Nothing is seeded by default: every test that shows
    /// a list opens it, so the loading path is the one under test.
    static func make(
        feed: ArticleFeed = ArticleFeed(),
        savedPageFeed: SavedPageFeed = SavedPageFeed(),
        triage: TriageLog = TriageLog(),
        savedPages: SavedPageLog = SavedPageLog(),
        sweeps: SweepLog = SweepLog(),
        progress: ReadingProgressLog = ReadingProgressLog(),
        discovery: SourceDiscovery = SourceDiscovery(),
        subscriptionSource: SubscriptionSource = SubscriptionSource([[]]),
        articles: [APIArticle] = [],
        seededSavedPages: [APISavedPage] = [],
        subscriptions: [APISubscription] = [],
        articleState: ReaderLoadState = .idle,
        subscriptionState: ReaderLoadState = .loaded,
        scope: ArticleListScope = .library,
        filter: ArticleFilter = ReaderStore.defaultFilter
    ) -> ReaderStore {
        var client = PreviewFixtures.apiClient
        client.fetchArticles = { _, query, cursor in
            try await feed.page(query: query, cursor: cursor)
        }
        client.fetchSavedPages = { _, cursor in try await savedPageFeed.page(cursor: cursor) }
        client.fetchSubscriptions = { _ in await subscriptionSource.next() }
        client.updateReadState = { _, ids, value in try await triage.record(.read, ids, value) }
        client.updateStarredState = { _, ids, value in
            try await triage.record(.starred, ids, value)
        }
        client.updateReadLaterState = { _, ids, value in
            try await triage.record(.readLater, ids, value)
        }
        client.markAllRead = { _, request in try await sweeps.run(request) }
        client.updateSavedPageReadState = { _, ids, value in
            try await savedPages.record(.read, ids, value)
        }
        client.deleteSavedPage = { _, id in try await savedPages.record(.remove, [id]) }
        client.retrySavedPage = { _, id in try await savedPages.runRetry(id) }
        client.createSubscription = { _, url in try await discovery.resolve(url) }
        client.updateArticleReadingProgress = { _, positions in
            try await progress.recordArticles(positions)
        }
        client.updateSavedPageReadingProgress = { _, positions in
            try await progress.recordSavedPages(positions)
        }
        return ReaderStore(
            apiClient: client,
            connection: PreviewFixtures.connection,
            articles: articles,
            savedPages: seededSavedPages,
            subscriptions: subscriptions,
            articleState: articleState,
            subscriptionState: subscriptionState,
            scope: scope,
            filter: filter
        )
    }
}

extension APIArticle {
    /// A store-test article: only the fields the store reasons about vary, and the timestamp is
    /// explicit because "older than" is decided by it.
    static func testArticle(
        id: String,
        subscriptionId: String = "7",
        publishedAt: String? = "2026-07-22T12:00:00.000Z",
        read: Bool = false,
        starred: Bool = false,
        readLater: Bool = false
    ) -> APIArticle {
        APIArticle(
            id: id,
            subscriptionId: subscriptionId,
            title: "Article \(id)",
            url: URL(string: "https://example.com/\(id)"),
            canonicalUrl: nil,
            author: nil,
            publishedAt: publishedAt,
            createdAt: "2026-07-22T12:01:00.000Z",
            feed: APIFeed(
                id: subscriptionId,
                title: "Source \(subscriptionId)",
                url: URL(string: "https://example.com/feed.xml")!,
                siteUrl: nil
            ),
            content: .init(html: "<p>Body</p>", source: .feed),
            preview: "A snippet.",
            readingTime: 3,
            audio: nil,
            state: .init(
                read: read,
                starred: starred,
                readLater: readLater,
                readingProgress: nil
            )
        )
    }
}

extension APISubscription {
    static func testSubscription(
        id: String,
        folder: Folder?,
        unreadCount: Int
    ) -> APISubscription {
        APISubscription(
            id: id,
            title: "Source \(id)",
            feed: .init(
                id: id,
                url: URL(string: "https://example.com/\(id)/feed.xml")!,
                siteUrl: nil
            ),
            folder: folder,
            unreadCount: unreadCount,
            paused: false
        )
    }
}
