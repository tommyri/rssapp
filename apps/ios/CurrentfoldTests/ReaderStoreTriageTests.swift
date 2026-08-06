import XCTest
@testable import Currentfold

/// The mutation side of the store: optimistic writes, granular rollback, and the mark-all-read
/// sweep applied to everything this session has loaded.
@MainActor
final class ReaderStoreTriageTests: XCTestCase {
    func testReadArticleCanBeMarkedUnread() async throws {
        let triage = TriageLog()
        let store = ReaderTestStore.make(
            triage: triage,
            articles: [.testArticle(id: "1", read: true)],
            articleState: .loaded
        )

        await store.setRead(articleID: "1", read: false)

        XCTAssertFalse(try XCTUnwrap(store.article(id: "1")).state.read)
        let updates = await triage.recorded()
        XCTAssertEqual(updates, [.init(verb: .read, articleIDs: ["1"], value: false)])
    }

    func testStarringAndSavingSendTheirOwnRequests() async throws {
        let triage = TriageLog()
        let store = ReaderTestStore.make(
            triage: triage,
            articles: [.testArticle(id: "1")],
            articleState: .loaded
        )

        await store.setStarred(articleID: "1", starred: true)
        await store.setReadLater(articleID: "1", readLater: true)

        let article = try XCTUnwrap(store.article(id: "1"))
        XCTAssertTrue(article.state.starred)
        XCTAssertTrue(article.state.readLater)
        let updates = await triage.recorded()
        XCTAssertEqual(
            updates,
            [
                .init(verb: .starred, articleIDs: ["1"], value: true),
                .init(verb: .readLater, articleIDs: ["1"], value: true),
            ]
        )
    }

    func testAMutationThatChangesNothingIsNotSent() async throws {
        let triage = TriageLog()
        let store = ReaderTestStore.make(
            triage: triage,
            articles: [.testArticle(id: "1", starred: true)],
            articleState: .loaded
        )

        await store.setStarred(articleID: "1", starred: true)

        let updates = await triage.recorded()
        XCTAssertTrue(updates.isEmpty)
    }

    // MARK: - Rollback

    func testARefusedStarRollsBackAndReportsTheFailure() async throws {
        let triage = TriageLog()
        await triage.refuse(.starred)
        let store = ReaderTestStore.make(
            triage: triage,
            articles: [.testArticle(id: "1")],
            articleState: .loaded
        )

        await store.setStarred(articleID: "1", starred: true)

        XCTAssertFalse(try XCTUnwrap(store.article(id: "1")).state.starred)
        XCTAssertEqual(
            store.mutationError,
            TriageLog.refusal.localizedDescription
        )
    }

    func testARefusedReadLaterRollsBackInEveryLoadedList() async throws {
        let scope = ArticleListScope.subscription(id: "7")
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1")])
        await feed.stub(.init(scope: scope, filter: .unread), [.testArticle(id: "1")])
        let triage = TriageLog()
        await triage.refuse(.readLater)
        let store = ReaderTestStore.make(feed: feed, triage: triage)
        await store.openList(scope: .library)
        await store.openList(scope: scope)

        await store.setReadLater(articleID: "1", readLater: true)

        XCTAssertFalse(try XCTUnwrap(store.list(for: .library).articles.first).state.readLater)
        XCTAssertFalse(try XCTUnwrap(store.list(for: scope).articles.first).state.readLater)
    }

    /// A rollback restores the one field that failed. While the star request is in flight the
    /// reader also marks the article read, and that must survive the star's failure.
    func testARollbackDoesNotUndoADifferentVerbCommittedMeanwhile() async throws {
        let gate = Gate()
        var client = PreviewFixtures.apiClient
        client.fetchArticles = { _, _, _ in
            APIArticlePage(data: [], pagination: .init(nextCursor: nil))
        }
        client.updateStarredState = { _, _, _ in
            await gate.arrive()
            await gate.waitForRelease()
            throw TriageLog.refusal
        }
        client.updateReadState = { _, _, _ in }
        let store = ReaderStore(
            apiClient: client,
            connection: PreviewFixtures.connection,
            articles: [.testArticle(id: "1")],
            articleState: .loaded,
            subscriptionState: .loaded
        )

        let starring = Task { await store.setStarred(articleID: "1", starred: true) }
        await gate.started()
        await store.setRead(articleID: "1", read: true)
        await gate.release()
        await starring.value

        let article = try XCTUnwrap(store.article(id: "1"))
        XCTAssertFalse(article.state.starred)
        XCTAssertTrue(article.state.read)
    }

    // MARK: - Mark all read

    func testMarkAllReadSweepsLoadedArticlesAndRefreshesSources() async throws {
        let feed = ArticleFeed()
        await feed.stub(
            .init(filter: .unread),
            [.testArticle(id: "1"), .testArticle(id: "2")]
        )
        let sweeps = SweepLog()
        await sweeps.report(markedCount: 12)
        let subscriptionSource = SubscriptionSource([
            [.testSubscription(id: "7", folder: nil, unreadCount: 2)],
            [.testSubscription(id: "7", folder: nil, unreadCount: 0)],
        ])
        let store = ReaderTestStore.make(
            feed: feed,
            sweeps: sweeps,
            subscriptionSource: subscriptionSource,
            subscriptionState: .idle
        )
        await store.bootstrap()
        await store.openList(scope: .library)

        let marked = await store.markAllRead(scope: .library, olderThan: nil)

        XCTAssertEqual(marked, 12)
        let list = store.list(for: .library)
        XCTAssertEqual(list.articles.map(\.id), ["1", "2"], "the sweep must not remove rows")
        XCTAssertTrue(list.articles.allSatisfy(\.state.read))
        XCTAssertEqual(store.subscriptions.first?.unreadCount, 0)
        let fetches = await subscriptionSource.fetches()
        XCTAssertEqual(fetches, 2, "the sweep has to refresh the Sources counts")
        let requests = await sweeps.recorded()
        XCTAssertEqual(requests, [APIMarkAllReadRequest(scope: .library, olderThan: nil)])
    }

    func testMarkAllReadOlderThanLeavesNewerArticlesUnread() async throws {
        let feed = ArticleFeed()
        await feed.stub(
            .init(filter: .unread),
            [
                .testArticle(id: "old", publishedAt: "2026-07-01T12:00:00.000Z"),
                .testArticle(id: "new", publishedAt: "2026-08-04T12:00:00.000Z"),
            ]
        )
        let sweeps = SweepLog()
        let store = ReaderTestStore.make(feed: feed, sweeps: sweeps)
        await store.openList(scope: .library)
        let cutoff = try XCTUnwrap(APITimestamp.date(from: "2026-07-15T00:00:00.000Z"))

        _ = await store.markAllRead(scope: .library, olderThan: cutoff)

        XCTAssertTrue(try XCTUnwrap(store.article(id: "old")).state.read)
        XCTAssertFalse(try XCTUnwrap(store.article(id: "new")).state.read)
        let requests = await sweeps.recorded()
        XCTAssertEqual(requests.first?.olderThan, "2026-07-15T00:00:00.000Z")
    }

    func testMarkAllReadInOneSourceLeavesOtherSourcesAlone() async throws {
        let feed = ArticleFeed()
        await feed.stub(
            .init(filter: .unread),
            [
                .testArticle(id: "mine", subscriptionId: "7"),
                .testArticle(id: "theirs", subscriptionId: "8"),
            ]
        )
        let sweeps = SweepLog()
        let store = ReaderTestStore.make(feed: feed, sweeps: sweeps)
        await store.openList(scope: .library)

        _ = await store.markAllRead(scope: .subscription(id: "7"), olderThan: nil)

        XCTAssertTrue(try XCTUnwrap(store.article(id: "mine")).state.read)
        XCTAssertFalse(try XCTUnwrap(store.article(id: "theirs")).state.read)
        let requests = await sweeps.recorded()
        XCTAssertEqual(
            requests,
            [APIMarkAllReadRequest(scope: .subscription(id: "7"), olderThan: nil)]
        )
    }

    /// The folder sweep has to resolve articles through their subscription, the same join the
    /// server makes.
    func testMarkAllReadInAFolderSweepsOnlyItsSources() async throws {
        let feed = ArticleFeed()
        await feed.stub(
            .init(filter: .unread),
            [
                .testArticle(id: "design", subscriptionId: "7"),
                .testArticle(id: "news", subscriptionId: "8"),
            ]
        )
        let store = ReaderTestStore.make(
            feed: feed,
            subscriptions: [
                .testSubscription(id: "7", folder: .init(id: "2", name: "Design"), unreadCount: 1),
                .testSubscription(id: "8", folder: .init(id: "3", name: "News"), unreadCount: 1),
            ]
        )
        await store.openList(scope: .library)

        _ = await store.markAllRead(scope: .folder(id: "2"), olderThan: nil)

        XCTAssertTrue(try XCTUnwrap(store.article(id: "design")).state.read)
        XCTAssertFalse(try XCTUnwrap(store.article(id: "news")).state.read)
    }

    func testARefusedSweepChangesNothingAndReportsTheFailure() async throws {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1")])
        let sweeps = SweepLog()
        await sweeps.failEveryRequest(with: .sessionExpired)
        let store = ReaderTestStore.make(feed: feed, sweeps: sweeps)
        await store.openList(scope: .library)

        let marked = await store.markAllRead(scope: .library, olderThan: nil)

        XCTAssertNil(marked)
        XCTAssertFalse(try XCTUnwrap(store.article(id: "1")).state.read)
        XCTAssertEqual(
            store.mutationError,
            CurrentfoldAPIError.sessionExpired.localizedDescription
        )
    }

    func testFolderUnreadCountsAddUpTheirSources() {
        let store = ReaderTestStore.make(
            subscriptions: [
                .testSubscription(id: "7", folder: .init(id: "2", name: "Design"), unreadCount: 4),
                .testSubscription(id: "8", folder: .init(id: "2", name: "Design"), unreadCount: 2431),
                .testSubscription(id: "9", folder: nil, unreadCount: 9),
            ]
        )

        XCTAssertEqual(store.unreadCount(inFolder: "2"), 2435)
        XCTAssertEqual(store.unreadCount(inFolder: "3"), 0)
    }

    /// The three sweep sizes are what the reader is promised in the confirmation, so the copy and
    /// the cutoff are pinned together.
    func testSweepCutoffsMatchTheirPromise() throws {
        let now = try XCTUnwrap(APITimestamp.date(from: "2026-08-05T12:00:00.000Z"))

        XCTAssertNil(MarkAllReadSweep.everything.cutoff(now: now))
        XCTAssertEqual(
            MarkAllReadSweep.olderThanADay.cutoff(now: now),
            try XCTUnwrap(APITimestamp.date(from: "2026-08-04T12:00:00.000Z"))
        )
        XCTAssertEqual(
            MarkAllReadSweep.olderThanAWeek.cutoff(now: now),
            try XCTUnwrap(APITimestamp.date(from: "2026-07-29T12:00:00.000Z"))
        )
    }

    func testSweepReceiptNeverReportsZeroArticles() {
        XCTAssertEqual(MarkAllReadSweep.receipt(markedCount: 0), "Nothing left to mark read")
        XCTAssertEqual(MarkAllReadSweep.receipt(markedCount: 1), "1 article marked read")
        XCTAssertEqual(MarkAllReadSweep.receipt(markedCount: 12), "12 articles marked read")
    }
}
