import XCTest
@testable import Currentfold

/// The list side of the store: which question each list asks the server, and the
/// session-stable rule that keeps a list from rearranging itself under the reader.
@MainActor
final class ReaderStoreTests: XCTestCase {
    func testTheReaderDefaultsToUnread() async throws {
        XCTAssertEqual(ReaderStore.defaultFilter, .unread)

        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1")])
        let store = ReaderTestStore.make(feed: feed)

        await store.openList(scope: .library)

        XCTAssertEqual(store.list(for: .library).filter, .unread)
        XCTAssertEqual(store.list(for: .library).articles.map(\.id), ["1"])
    }

    func testAPushedListAsksOnlyForItsOwnScope() async throws {
        let scope = ArticleListScope.subscription(id: "7")
        let feed = ArticleFeed()
        await feed.stub(.init(scope: scope, filter: .unread), [.testArticle(id: "1")])
        let store = ReaderTestStore.make(feed: feed)

        await store.openList(scope: scope)

        let requests = await feed.requests()
        XCTAssertEqual(requests, [.init(scope: scope, filter: .unread)])
        XCTAssertEqual(store.list(for: scope).articles.map(\.id), ["1"])
        XCTAssertTrue(store.list(for: .library).articles.isEmpty)
    }

    func testSwitchingViewsRestartsPaginationWithTheNewFilter() async throws {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1")], nextCursor: "page-2")
        await feed.stub(.init(filter: .starred), [.testArticle(id: "9", starred: true)])
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)

        await store.setFilter(.starred, for: .library)

        let list = store.list(for: .library)
        XCTAssertEqual(list.filter, .starred)
        XCTAssertEqual(list.articles.map(\.id), ["9"])

        // The server was asked a different question, from the top — not filtered client-side.
        let requests = await feed.requests()
        XCTAssertEqual(requests.map(\.filter), [.unread, .starred])
        XCTAssertTrue(requests.allSatisfy { $0.cursor == nil })

        // And the unread cursor did not survive the switch.
        await store.loadMoreIfNeeded(scope: .library, currentEntryID: .article("9"))
        let afterSwitch = await feed.requests()
        XCTAssertEqual(afterSwitch.count, 2)
    }

    func testSwitchingToTheFilterAlreadyShowingDoesNothing() async throws {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1")])
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)

        await store.setFilter(.unread, for: .library)

        let requests = await feed.requests()
        XCTAssertEqual(requests.count, 1)
    }

    // MARK: - Session-stable unread

    func testAnArticleReadDuringThisVisitStaysInTheUnreadList() async throws {
        let feed = ArticleFeed()
        await feed.stub(
            .init(filter: .unread),
            [.testArticle(id: "1"), .testArticle(id: "2")]
        )
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)

        await store.setRead(articleID: "1", read: true)

        let list = store.list(for: .library)
        XCTAssertEqual(list.articles.map(\.id), ["1", "2"])
        XCTAssertTrue(try XCTUnwrap(list.articles.first).state.read)
    }

    func testMarkingAnArticleUnreadAgainAlsoKeepsItWhereItIs() async throws {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1"), .testArticle(id: "2")])
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)
        await store.setRead(articleID: "1", read: true)

        await store.setRead(articleID: "1", read: false)

        let list = store.list(for: .library)
        XCTAssertEqual(list.articles.map(\.id), ["1", "2"])
        XCTAssertFalse(try XCTUnwrap(list.articles.first).state.read)
    }

    /// Starred and Read Later follow the same rule, so un-starring inside Starred does not yank
    /// the row out from under the finger that did it.
    func testUnstarringInsideStarredKeepsTheRowUntilAReload() async throws {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .starred), [.testArticle(id: "1", starred: true)])
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)
        await store.setFilter(.starred, for: .library)

        await store.setStarred(articleID: "1", starred: false)

        XCTAssertEqual(store.list(for: .library).articles.map(\.id), ["1"])

        await feed.stub(.init(filter: .starred), [])
        await store.reload(scope: .library)

        XCTAssertTrue(store.list(for: .library).articles.isEmpty)
    }

    func testPullToRefreshDropsWhatWasReadDuringThePreviousVisit() async throws {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1"), .testArticle(id: "2")])
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)
        await store.setRead(articleID: "1", read: true)

        await feed.stub(.init(filter: .unread), [.testArticle(id: "2")])
        await store.reload(scope: .library)

        XCTAssertEqual(store.list(for: .library).articles.map(\.id), ["2"])
    }

    /// Reopening a pushed list is a fresh visit: the view calls `openList` again and the rows it
    /// finished last time are gone.
    func testReopeningAListIsAFreshVisit() async throws {
        let scope = ArticleListScope.subscription(id: "7")
        let feed = ArticleFeed()
        await feed.stub(
            .init(scope: scope, filter: .unread),
            [.testArticle(id: "1"), .testArticle(id: "2")]
        )
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: scope)
        await store.setRead(articleID: "1", read: true)

        await feed.stub(.init(scope: scope, filter: .unread), [.testArticle(id: "2")])
        await store.openList(scope: scope)

        XCTAssertEqual(store.list(for: scope).articles.map(\.id), ["2"])
    }

    func testSwitchingFiltersAndBackClearsTheSession() async throws {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1"), .testArticle(id: "2")])
        await feed.stub(.init(filter: .all), [.testArticle(id: "1", read: true)])
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)
        await store.setRead(articleID: "1", read: true)

        await feed.stub(.init(filter: .unread), [.testArticle(id: "2")])
        await store.setFilter(.all, for: .library)
        await store.setFilter(.unread, for: .library)

        XCTAssertEqual(store.list(for: .library).articles.map(\.id), ["2"])
    }

    // MARK: - Cross-list state

    func testAMutationInOneListIsVisibleInEveryOtherLoadedList() async throws {
        let scope = ArticleListScope.subscription(id: "7")
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1")])
        await feed.stub(.init(scope: scope, filter: .unread), [.testArticle(id: "1")])
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)
        await store.openList(scope: scope)

        await store.setStarred(articleID: "1", starred: true)

        XCTAssertTrue(try XCTUnwrap(store.list(for: .library).articles.first).state.starred)
        XCTAssertTrue(try XCTUnwrap(store.list(for: scope).articles.first).state.starred)
        XCTAssertTrue(try XCTUnwrap(store.article(id: "1")).state.starred)
    }

    /// An article stays resolvable after the list it came from has refreshed it away, because a
    /// reader can be part-way through it while that happens.
    func testAnOpenArticleSurvivesTheListRefreshingItAway() async throws {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .unread), [.testArticle(id: "1")])
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)
        await store.setRead(articleID: "1", read: true)

        await feed.stub(.init(filter: .unread), [])
        await store.reload(scope: .library)

        XCTAssertTrue(store.list(for: .library).articles.isEmpty)
        XCTAssertNotNil(store.article(id: "1"))
    }

    // MARK: - Pagination and failure

    func testPaginationAppendsWithoutDuplicates() async throws {
        let feed = ArticleFeed()
        await feed.stub(
            .init(filter: .unread),
            [.testArticle(id: "1"), .testArticle(id: "2")],
            nextCursor: "page-2"
        )
        await feed.stub(
            .init(filter: .unread, cursor: "page-2"),
            [.testArticle(id: "2"), .testArticle(id: "3")]
        )
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)

        await store.loadMoreIfNeeded(scope: .library, currentEntryID: .article("2"))

        XCTAssertEqual(store.list(for: .library).articles.map(\.id), ["1", "2", "3"])
    }

    func testPaginationOnlyRunsAtTheEndOfTheList() async throws {
        let feed = ArticleFeed()
        await feed.stub(
            .init(filter: .unread),
            [.testArticle(id: "1"), .testArticle(id: "2")],
            nextCursor: "page-2"
        )
        let store = ReaderTestStore.make(feed: feed)
        await store.openList(scope: .library)

        await store.loadMoreIfNeeded(scope: .library, currentEntryID: .article("1"))

        let requests = await feed.requests()
        XCTAssertEqual(requests.count, 1)
    }

    func testAFailedFirstLoadIsReportedOnThatListAlone() async throws {
        let feed = ArticleFeed()
        await feed.failEveryRequest(with: .sessionExpired)
        let store = ReaderTestStore.make(feed: feed)

        await store.openList(scope: .library)

        XCTAssertEqual(
            store.list(for: .library).loadState,
            .failed(CurrentfoldAPIError.sessionExpired.localizedDescription)
        )
        XCTAssertEqual(store.list(for: .subscription(id: "7")).loadState, .idle)
    }

    /// A slow answer must not land on top of a newer one — the view switcher makes that race a
    /// single tap away.
    func testASlowLoadCannotOverwriteANewerOne() async throws {
        let gate = Gate()
        var client = PreviewFixtures.apiClient
        client.fetchArticles = { _, query, _ in
            guard query.filter == .unread else {
                return APIArticlePage(
                    data: [.testArticle(id: "starred", starred: true)],
                    pagination: .init(nextCursor: nil)
                )
            }
            await gate.arrive()
            await gate.waitForRelease()
            return APIArticlePage(
                data: [.testArticle(id: "unread")],
                pagination: .init(nextCursor: "stale-cursor")
            )
        }
        let store = ReaderStore(
            apiClient: client,
            connection: PreviewFixtures.connection,
            subscriptionState: .loaded
        )

        let opening = Task { await store.openList(scope: .library) }
        await gate.started()
        await store.setFilter(.starred, for: .library)
        await gate.release()
        await opening.value

        let list = store.list(for: .library)
        XCTAssertEqual(list.filter, .starred)
        XCTAssertEqual(list.articles.map(\.id), ["starred"])
        XCTAssertEqual(list.loadState, .loaded)
    }
}
