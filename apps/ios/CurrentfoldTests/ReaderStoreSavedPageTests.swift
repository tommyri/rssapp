import XCTest
@testable import Currentfold

/// The saved-page entity: its three verbs, their rollbacks, and the tombstone that keeps a
/// removed row in place until a deliberate reload.
///
/// Removing is the one verb in the app that deletes rather than un-flags, so it is the one
/// place the session-stable rule had to be decided again rather than inherited. It came out
/// the same: the row stays, and says so.
@MainActor
final class ReaderStoreSavedPageTests: XCTestCase {
    // MARK: - Session stability

    func testRemovingASavedPageKeepsItsRowUntilAReload() async throws {
        let savedPages = SavedPageLog()
        let store = await ReaderTestStore.openQueue(
            articles: [.testArticle(id: "a1", readLater: true)],
            savedPages: [.testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z")],
            savedPageLog: savedPages
        )

        await store.removeSavedPage(savedPageID: "s1")

        let entries = store.list(for: .library).entries
        XCTAssertEqual(entries.map(\.id), [.savedPage("s1"), .article("a1")])
        XCTAssertTrue(try XCTUnwrap(entries.first?.savedPage).isRemoved)
        let updates = await savedPages.recorded()
        XCTAssertEqual(updates, [.init(verb: .remove, savedPageIDs: ["s1"], value: true)])
    }

    func testAReloadDropsARemovedSavedPage() async throws {
        let savedPageFeed = SavedPageFeed()
        let store = await ReaderTestStore.openQueue(
            articles: [],
            savedPages: [.testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z")],
            savedPageFeed: savedPageFeed
        )
        await store.removeSavedPage(savedPageID: "s1")

        await savedPageFeed.stub([])
        await store.reload(scope: .library)

        XCTAssertTrue(store.list(for: .library).entries.isEmpty)
    }

    func testASavedPageReadDuringThisVisitStaysInPlace() async throws {
        let store = await ReaderTestStore.openQueue(
            articles: [],
            savedPages: [
                .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z"),
                .testSavedPage(id: "s2", savedAt: "2026-07-24T08:00:00.000Z"),
            ]
        )

        await store.setSavedPageRead(savedPageID: "s1", read: true)

        let entries = store.list(for: .library).entries
        XCTAssertEqual(entries.map(\.id), [.savedPage("s1"), .savedPage("s2")])
        XCTAssertTrue(try XCTUnwrap(entries.first?.savedPage).page.state.read)
    }

    // MARK: - Rollback

    func testARefusedReadStateRollsBack() async throws {
        let savedPages = SavedPageLog()
        await savedPages.refuse(.read)
        let store = await ReaderTestStore.openQueue(
            articles: [],
            savedPages: [.testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z")],
            savedPageLog: savedPages
        )

        await store.setSavedPageRead(savedPageID: "s1", read: true)

        XCTAssertFalse(try XCTUnwrap(store.savedPage(id: "s1")).page.state.read)
        XCTAssertEqual(store.mutationError, SavedPageLog.refusal.localizedDescription)
    }

    func testARefusedRemoveRestoresTheRow() async throws {
        let savedPages = SavedPageLog()
        await savedPages.refuse(.remove)
        let store = await ReaderTestStore.openQueue(
            articles: [],
            savedPages: [.testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z")],
            savedPageLog: savedPages
        )

        await store.removeSavedPage(savedPageID: "s1")

        XCTAssertFalse(try XCTUnwrap(store.savedPage(id: "s1")).isRemoved)
        XCTAssertEqual(store.mutationError, SavedPageLog.refusal.localizedDescription)
    }

    // MARK: - Retry

    func testRetryReplacesTheRowWithTheOutcomeItWaitedFor() async throws {
        let savedPages = SavedPageLog()
        await savedPages.answerRetry(
            with: .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z", status: .ready)
        )
        let store = await ReaderTestStore.openQueue(
            articles: [],
            savedPages: [
                .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z", status: .failed),
            ],
            savedPageLog: savedPages
        )
        XCTAssertEqual(try XCTUnwrap(store.savedPage(id: "s1")).copyState, .failed(
            "Could not fetch page: HTTP 403 Forbidden"
        ))

        await store.retrySavedPage(savedPageID: "s1")

        XCTAssertEqual(try XCTUnwrap(store.savedPage(id: "s1")).copyState, .ready)
        let updates = await savedPages.recorded()
        XCTAssertEqual(updates.map(\.verb), [.retry])
    }

    /// Only a terminal failure can be retried. A page still pending is already being fetched,
    /// and asking again would spend the server's attempt budget for nothing.
    func testRetryDoesNothingToAPageStillBeingFetched() async throws {
        let savedPages = SavedPageLog()
        let store = await ReaderTestStore.openQueue(
            articles: [],
            savedPages: [
                .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z", status: .pending),
            ],
            savedPageLog: savedPages
        )

        await store.retrySavedPage(savedPageID: "s1")

        let attempts = await savedPages.recorded()
        XCTAssertTrue(attempts.isEmpty)
    }

    // MARK: - Watching a copy arrive

    func testRefreshingPicksUpAnArrivedCopyWithoutDisturbingReadState() async throws {
        let savedPageFeed = SavedPageFeed()
        let store = await ReaderTestStore.openQueue(
            articles: [],
            savedPages: [
                .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z", status: .pending),
            ],
            savedPageFeed: savedPageFeed
        )
        await store.setSavedPageRead(savedPageID: "s1", read: true)

        // The server answers with the copy — and with the read state it had before the PATCH.
        await savedPageFeed.stub([
            .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z", status: .ready),
        ])
        let found = await store.refreshSavedPageCopies(watching: "s1")

        XCTAssertTrue(found)
        let entry = try XCTUnwrap(store.savedPage(id: "s1"))
        XCTAssertEqual(entry.copyState, .ready)
        XCTAssertTrue(entry.page.state.read, "a poll must not undo this session's read state")
    }

    func testRefreshingReportsAPageThatHasFallenOffTheFirstPage() async throws {
        let savedPageFeed = SavedPageFeed()
        let store = await ReaderTestStore.openQueue(
            articles: [],
            savedPages: [
                .testSavedPage(id: "s1", savedAt: "2026-07-24T09:00:00.000Z", status: .pending),
            ],
            savedPageFeed: savedPageFeed
        )

        await savedPageFeed.stub([.testSavedPage(id: "s9", savedAt: "2026-07-25T09:00:00.000Z")])

        let found = await store.refreshSavedPageCopies(watching: "s1")
        XCTAssertFalse(found)
    }
}
