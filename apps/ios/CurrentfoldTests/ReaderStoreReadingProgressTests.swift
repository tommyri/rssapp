import XCTest
@testable import Currentfold

/// The store's half of progress sync: which positions leave, what comes back, and what
/// happens to a position the server refused.
///
/// The scroll mechanics are deliberately not here. Where a `WKWebView` thinks it is depends on
/// a real layout pass, a real content height that arrives after the document does, and real
/// safe-area insets — none of which exist in a unit test, and all of which a fake would have
/// to invent. That part was verified on the simulator instead; everything below the scroll
/// offset is measured here.
@MainActor
final class ReaderStoreReadingProgressTests: XCTestCase {
    func testAFlushWritesBothStreamsInOneBatchEach() async {
        let progress = ReadingProgressLog()
        let store = await openQueue(progress: progress)

        store.recordReadingProgress(0.4, for: .article("a1"))
        store.recordReadingProgress(0.6, for: .savedPage("s1"))
        await store.flushReadingProgress()

        let articles = await progress.articleRequests()
        let savedPages = await progress.savedPageRequests()
        XCTAssertEqual(articles.count, 1)
        XCTAssertEqual(articles.first?.map(\.articleId), ["a1"])
        XCTAssertEqual(savedPages.count, 1)
        XCTAssertEqual(savedPages.first?.map(\.savedPageId), ["s1"])
    }

    /// Nothing queued, nothing sent. The reading screens flush on every close and every
    /// backgrounding, so this is the common case, not an edge one.
    func testAFlushWithNothingQueuedMakesNoRequest() async {
        let progress = ReadingProgressLog()
        let store = await openQueue(progress: progress)

        await store.flushReadingProgress()

        let articles = await progress.articleRequests()
        XCTAssertTrue(articles.isEmpty)
    }

    /// Opening a row and closing it again is not a change, so it is not a request.
    func testOpeningARowAndReportingWhereItResumedWritesNothing() async {
        let progress = ReadingProgressLog()
        let store = await openQueue(progress: progress, articleProgress: 0.42)

        store.beginReading(.article("a1"))
        store.recordReadingProgress(0.42, for: .article("a1"))
        await store.flushReadingProgress()

        let articles = await progress.articleRequests()
        XCTAssertTrue(articles.isEmpty)
    }

    /// The store keeps what the server *stored*. A reader who scrolled to the end has no
    /// resume point, and the local copy has to agree or the next open would jump to the end.
    func testTheStoredEchoIsAppliedToTheLocalRow() async {
        let store = await openQueue(articleProgress: 0.2)

        store.recordReadingProgress(0.97, for: .article("a1"))
        await store.flushReadingProgress()

        XCTAssertNil(store.article(id: "a1")?.state.readingProgress)
        XCTAssertNil(store.resumePosition(for: .article("a1")))
    }

    func testAMeaningfulEchoBecomesTheRowsResumePosition() async {
        let store = await openQueue()

        store.recordReadingProgress(0.42, for: .savedPage("s1"))
        await store.flushReadingProgress()

        XCTAssertEqual(store.savedPage(id: "s1")?.page.state.readingProgress, 0.42)
        XCTAssertEqual(store.resumePosition(for: .savedPage("s1")), 0.42)
    }

    /// The whole reason the queue exists: a refusal is silent, and the next flush carries the
    /// position again.
    func testARefusedBatchIsRetriedOnTheNextFlush() async {
        let progress = ReadingProgressLog()
        await progress.refuseArticles()
        let store = await openQueue(progress: progress)

        store.recordReadingProgress(0.4, for: .article("a1"))
        await store.flushReadingProgress()
        await progress.refuseArticles(false)
        await store.flushReadingProgress()

        let articles = await progress.articleRequests()
        XCTAssertEqual(articles.count, 2)
        XCTAssertEqual(articles.last?.first?.readingProgress, 0.4)
        XCTAssertEqual(store.article(id: "a1")?.state.readingProgress, 0.4)
    }

    /// A refusal must not become an alert. The reader is mid-article; a scroll offset that did
    /// not save is not worth interrupting them for.
    func testARefusedProgressWriteIsSilent() async {
        let progress = ReadingProgressLog()
        await progress.refuseArticles()
        await progress.refuseSavedPages()
        let store = await openQueue(progress: progress)

        store.recordReadingProgress(0.4, for: .article("a1"))
        store.recordReadingProgress(0.4, for: .savedPage("s1"))
        await store.flushReadingProgress()

        XCTAssertNil(store.mutationError)
    }

    /// One stream failing must not cost the other its write, and must not put its rows back in
    /// the queue either.
    func testOneStreamsRefusalDoesNotRequeueTheOther() async {
        let progress = ReadingProgressLog()
        await progress.refuseArticles()
        let store = await openQueue(progress: progress)

        store.recordReadingProgress(0.4, for: .article("a1"))
        store.recordReadingProgress(0.6, for: .savedPage("s1"))
        await store.flushReadingProgress()
        await store.flushReadingProgress()

        let savedPages = await progress.savedPageRequests()
        let articles = await progress.articleRequests()
        XCTAssertEqual(savedPages.count, 1, "the saved page landed and stayed landed")
        XCTAssertEqual(articles.count, 2, "the article came back around")
        XCTAssertEqual(store.savedPage(id: "s1")?.page.state.readingProgress, 0.6)
    }

    /// The flush that matters most is the last one — a screen closing, or the app leaving the
    /// foreground — and it arrives while a throttled flush may still be in flight. It queues
    /// behind that one rather than being dropped.
    func testASecondFlushWaitsForTheFirstRatherThanBeingDropped() async {
        let progress = ReadingProgressLog()
        let store = await openQueue(progress: progress)

        store.recordReadingProgress(0.3, for: .article("a1"))
        async let first: Void = store.flushReadingProgress()
        store.recordReadingProgress(0.8, for: .savedPage("s1"))
        async let second: Void = store.flushReadingProgress()
        _ = await (first, second)

        let savedPages = await progress.savedPageRequests()
        XCTAssertEqual(savedPages.flatMap { $0 }.map(\.savedPageId), ["s1"])
        XCTAssertEqual(store.savedPage(id: "s1")?.page.state.readingProgress, 0.8)
    }

    // MARK: - Resuming

    func testARowWithNoUsefulPositionIsNotResumed() async {
        let store = await openQueue(articleProgress: 0.01)

        XCTAssertNil(store.resumePosition(for: .article("a1")))
        XCTAssertNil(store.resumePosition(for: .article("nonexistent")))
    }

    func testARowResumesFromWhatTheServerSent() async {
        let store = await openQueue(articleProgress: 0.42)

        XCTAssertEqual(store.resumePosition(for: .article("a1")), 0.42)
    }

    // MARK: - Helpers

    /// The unified queue with one row of each kind, which is the only list where both streams
    /// are on screen at once.
    private func openQueue(
        progress: ReadingProgressLog = ReadingProgressLog(),
        articleProgress: Double? = nil
    ) async -> ReaderStore {
        var article = APIArticle.testArticle(id: "a1", readLater: true)
        article.state.readingProgress = articleProgress
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .readLater), [article])
        let savedPageFeed = SavedPageFeed()
        await savedPageFeed.stub([.testSavedPage(id: "s1", savedAt: "2026-07-24T09:15:00.000Z")])

        let store = ReaderTestStore.make(
            feed: feed,
            savedPageFeed: savedPageFeed,
            progress: progress
        )
        await store.openList(scope: .library)
        await store.setFilter(.readLater, for: .library)
        return store
    }
}
