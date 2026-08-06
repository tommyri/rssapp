import XCTest
@testable import Currentfold

/// The unified Read Later queue: two streams, two cursors, one order.
///
/// The invariant under test throughout is ``ReaderEntryMerge``'s: a row is shown only once no
/// unfetched row could sort above it. Most of the failure modes of a client-side merge are
/// violations of exactly that — a saved page appearing below an older article because its
/// page had not arrived yet, or a stream being paged twice while the other still had rows in
/// hand.
@MainActor
final class ReaderStoreReadLaterTests: XCTestCase {
    private let readLater = ArticleFilter.readLater

    // MARK: - Composition

    func testTheLibraryReadLaterViewMergesBothStreamsNewestFirst() async throws {
        let store = await ReaderTestStore.openQueue(
            articles: [
                .testArticle(id: "a1", publishedAt: "2026-07-24T10:00:00.000Z", readLater: true),
                .testArticle(id: "a2", publishedAt: "2026-07-24T06:00:00.000Z", readLater: true),
            ],
            savedPages: [
                .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z"),
                .testSavedPage(id: "s2", savedAt: "2026-07-24T07:00:00.000Z"),
            ]
        )

        XCTAssertEqual(
            store.list(for: .library).entries.map(\.id),
            [.article("a1"), .savedPage("s1"), .savedPage("s2"), .article("a2")]
        )
    }

    /// An article with no publication date sorts on `createdAt`, exactly as the contract
    /// orders it, so the merge cannot disagree with the server about where it belongs.
    func testAnArticleWithoutAPublicationDateMergesOnItsCreatedAt() async throws {
        let store = await ReaderTestStore.openQueue(
            articles: [.testArticle(id: "a1", publishedAt: nil, readLater: true)],
            savedPages: [
                .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z"),
                .testSavedPage(id: "s2", savedAt: "2026-07-01T09:00:00.000Z"),
            ]
        )

        // `testArticle` is created at 2026-07-22T12:01, between the two saved pages.
        XCTAssertEqual(
            store.list(for: .library).entries.map(\.id),
            [.savedPage("s1"), .article("a1"), .savedPage("s2")]
        )
    }

    /// A saved page belongs to no source, so a per-source Read Later view is articles-only
    /// and must not even ask the saved-page endpoint.
    func testAPerSourceReadLaterViewNeverAsksForSavedPages() async throws {
        let scope = ArticleListScope.subscription(id: "7")
        let feed = ArticleFeed()
        let savedPageFeed = SavedPageFeed()
        await feed.stub(
            .init(scope: scope, filter: readLater),
            [.testArticle(id: "a1", readLater: true)]
        )
        await savedPageFeed.stub([.testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z")])
        let store = ReaderTestStore.make(feed: feed, savedPageFeed: savedPageFeed)

        await store.openList(scope: scope)
        await store.setFilter(readLater, for: scope)

        XCTAssertEqual(store.list(for: scope).entries.map(\.id), [.article("a1")])
        let asked = await savedPageFeed.requests()
        XCTAssertTrue(asked.isEmpty)
    }

    func testTheOtherLibraryViewsStayArticlesOnly() async throws {
        let feed = ArticleFeed()
        let savedPageFeed = SavedPageFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "a1")])
        let store = ReaderTestStore.make(feed: feed, savedPageFeed: savedPageFeed)

        await store.openList(scope: .library)

        XCTAssertEqual(store.list(for: .library).entries.map(\.id), [.article("a1")])
        let asked = await savedPageFeed.requests()
        XCTAssertTrue(asked.isEmpty)
    }

    // MARK: - Pagination across two cursors

    /// The core claim. Each stream is at most one page ahead of the reader: a stream is asked
    /// for another page only once its buffer is empty, and the queue stops emitting at the
    /// point where the unfetched half could still have something newer.
    func testTheQueueStopsWhereTheUnfetchedStreamCouldStillBeNewer() async throws {
        let feed = ArticleFeed()
        let savedPageFeed = SavedPageFeed()
        await feed.stub(
            .init(filter: readLater),
            [
                .testArticle(id: "a1", publishedAt: "2026-07-24T10:00:00.000Z", readLater: true),
                .testArticle(id: "a2", publishedAt: "2026-07-24T09:00:00.000Z", readLater: true),
            ],
            nextCursor: "articles-2"
        )
        await savedPageFeed.stub(
            [.testSavedPage(id: "s1", savedAt: "2026-07-24T08:00:00.000Z")],
            nextCursor: "saved-2"
        )
        let store = ReaderTestStore.make(feed: feed, savedPageFeed: savedPageFeed)
        await store.openList(scope: .library)
        await store.setFilter(readLater, for: .library)

        // Both articles outrank the one saved page in hand, so both are shown — and then the
        // merge stops, because page two of the articles could hold something newer than s1.
        XCTAssertEqual(
            store.list(for: .library).entries.map(\.id),
            [.article("a1"), .article("a2")]
        )

        await feed.stub(
            .init(filter: readLater, cursor: "articles-2"),
            [.testArticle(id: "a3", publishedAt: "2026-07-24T07:00:00.000Z", readLater: true)]
        )
        await store.loadMoreIfNeeded(scope: .library, currentEntryID: .article("a2"))

        // Only the article stream was paged — the saved-page stream still had s1 in hand.
        let afterArticlePage = await savedPageFeed.requests()
        XCTAssertEqual(afterArticlePage, [nil])
        // s1 can now be placed, because an article older than it is in hand. a3 cannot: page
        // two of the saved pages could hold something between a3 and s1.
        XCTAssertEqual(
            store.list(for: .library).entries.map(\.id),
            [.article("a1"), .article("a2"), .savedPage("s1")]
        )

        await savedPageFeed.stub(
            cursor: "saved-2",
            [.testSavedPage(id: "s2", savedAt: "2026-07-24T07:30:00.000Z")]
        )
        await store.loadMoreIfNeeded(scope: .library, currentEntryID: .savedPage("s1"))

        // And it did hold one — which is why a3 had to wait.
        XCTAssertEqual(
            store.list(for: .library).entries.map(\.id),
            [.article("a1"), .article("a2"), .savedPage("s1"), .savedPage("s2"), .article("a3")]
        )
        let bothPaged = await savedPageFeed.requests()
        XCTAssertEqual(bothPaged, [nil, "saved-2"])
        let articleRequests = await feed.requests()
        XCTAssertEqual(
            articleRequests.map(\.cursor),
            [nil, nil, "articles-2"],
            "the article stream was not paged again while it still had a3 in hand"
        )
    }

    /// When one stream runs out, the other drains to the end without waiting for a page that
    /// is never coming.
    func testAnExhaustedStreamLetsTheOtherDrainCompletely() async throws {
        let feed = ArticleFeed()
        let savedPageFeed = SavedPageFeed()
        await feed.stub(
            .init(filter: readLater),
            [
                .testArticle(id: "a1", publishedAt: "2026-07-24T10:00:00.000Z", readLater: true),
                .testArticle(id: "a2", publishedAt: "2026-07-20T10:00:00.000Z", readLater: true),
            ]
        )
        await savedPageFeed.stub(
            [.testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z")],
            nextCursor: "saved-2"
        )
        await savedPageFeed.stub(
            cursor: "saved-2",
            [.testSavedPage(id: "s2", savedAt: "2026-07-22T09:00:00.000Z")]
        )
        let store = ReaderTestStore.make(feed: feed, savedPageFeed: savedPageFeed)
        await store.openList(scope: .library)
        await store.setFilter(readLater, for: .library)

        XCTAssertEqual(
            store.list(for: .library).entries.map(\.id),
            [.article("a1"), .savedPage("s1")]
        )

        await store.loadMoreIfNeeded(scope: .library, currentEntryID: .savedPage("s1"))

        XCTAssertEqual(
            store.list(for: .library).entries.map(\.id),
            [.article("a1"), .savedPage("s1"), .savedPage("s2"), .article("a2")]
        )
        XCTAssertFalse(store.list(for: .library).entries.isEmpty)
        // Both streams are finished, so the queue asks for nothing more.
        await store.loadMoreIfNeeded(scope: .library, currentEntryID: .article("a2"))
        let savedRequests = await savedPageFeed.requests()
        XCTAssertEqual(savedRequests, [nil, "saved-2"])
    }

    /// A keyset cursor sits between rows and rows move, so a stream can repeat one across
    /// pages. It must not appear twice.
    func testARepeatedRowIsNotShownTwice() async throws {
        let feed = ArticleFeed()
        let savedPageFeed = SavedPageFeed()
        await feed.stub(.init(filter: readLater), [])
        await savedPageFeed.stub(
            [.testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z")],
            nextCursor: "saved-2"
        )
        await savedPageFeed.stub(
            cursor: "saved-2",
            [
                .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z"),
                .testSavedPage(id: "s2", savedAt: "2026-07-24T08:00:00.000Z"),
            ]
        )
        let store = ReaderTestStore.make(feed: feed, savedPageFeed: savedPageFeed)
        await store.openList(scope: .library)
        await store.setFilter(readLater, for: .library)

        await store.loadMoreIfNeeded(scope: .library, currentEntryID: .savedPage("s1"))

        XCTAssertEqual(
            store.list(for: .library).entries.map(\.id),
            [.savedPage("s1"), .savedPage("s2")]
        )
    }

    /// Switching away from Read Later and back restarts both cursors, not just the articles'.
    func testLeavingTheQueueAndComingBackRestartsBothStreams() async throws {
        let feed = ArticleFeed()
        let savedPageFeed = SavedPageFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "u1")])
        await feed.stub(.init(filter: readLater), [])
        await savedPageFeed.stub([.testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z")])
        let store = ReaderTestStore.make(feed: feed, savedPageFeed: savedPageFeed)
        await store.openList(scope: .library)
        await store.setFilter(readLater, for: .library)

        await store.setFilter(.unread, for: .library)
        await store.setFilter(readLater, for: .library)

        let restarted = await savedPageFeed.requests()
        XCTAssertEqual(restarted, [nil, nil])
        XCTAssertEqual(store.list(for: .library).entries.map(\.id), [.savedPage("s1")])
    }

    /// The queue is one thing. A half of it that failed to load is not a shorter queue, it is
    /// a wrong one, so the list reports the failure rather than quietly showing articles only.
    func testAFailedSavedPageStreamFailsTheWholeQueue() async throws {
        let feed = ArticleFeed()
        let savedPageFeed = SavedPageFeed()
        await feed.stub(.init(filter: readLater), [.testArticle(id: "a1", readLater: true)])
        await savedPageFeed.failEveryRequest(with: .sessionExpired)
        let store = ReaderTestStore.make(feed: feed, savedPageFeed: savedPageFeed)
        await store.openList(scope: .library)

        await store.setFilter(readLater, for: .library)

        XCTAssertEqual(
            store.list(for: .library).loadState,
            .failed(CurrentfoldAPIError.sessionExpired.localizedDescription)
        )
    }
}
