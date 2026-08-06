import XCTest
@testable import Currentfold

/// The buffer that makes a resume position survive a failed write.
///
/// Everything here is about the same promise: **a progress write may fail silently, but it may
/// not be silently lost.** The queue is where that promise is kept, and it is a pure value
/// type precisely so the promise can be measured without a scroll view.
final class ReadingProgressQueueTests: XCTestCase {
    func testTheNewestPositionForARowReplacesTheOlderOne() {
        var queue = ReadingProgressQueue()
        queue.record(0.2, for: .article("42"))
        queue.record(0.6, for: .article("42"))

        let batch = queue.takeBatch()

        XCTAssertEqual(
            batch.articles,
            [APIArticleReadingProgressEntry(articleId: "42", readingProgress: 0.6)],
            "the contract rejects a repeated id, so one row is one entry"
        )
        XCTAssertTrue(queue.isEmpty)
    }

    func testTheTwoStreamsAreSplitIntoTheirOwnRequests() {
        var queue = ReadingProgressQueue()
        queue.record(0.3, for: .article("42"))
        queue.record(0.7, for: .savedPage("31"))

        let batch = queue.takeBatch()

        XCTAssertEqual(batch.articles.map(\.articleId), ["42"])
        XCTAssertEqual(batch.savedPages.map(\.savedPageId), ["31"])
    }

    /// An article id and a saved-page id can be the same string without meaning the same row.
    func testTheTwoIdSpacesDoNotCollide() {
        var queue = ReadingProgressQueue()
        queue.record(0.3, for: .article("31"))
        queue.record(0.7, for: .savedPage("31"))

        let batch = queue.takeBatch()

        XCTAssertEqual(batch.articles.first?.readingProgress, 0.3)
        XCTAssertEqual(batch.savedPages.first?.readingProgress, 0.7)
    }

    func testAPositionTheServerAlreadyHoldsIsNotQueued() {
        var queue = ReadingProgressQueue()
        queue.remember(stored: 0.42, for: .article("42"))

        queue.record(0.42, for: .article("42"))

        XCTAssertTrue(queue.isEmpty, "opening a row and reporting where it resumed writes nothing")
    }

    /// The other half of the same rule: a row the server holds *nothing* for, reported as
    /// nothing, is also not worth a request — which is what a short article that never scrolls
    /// produces.
    func testANullPositionMatchingAStoredNullIsNotQueued() {
        var queue = ReadingProgressQueue()
        queue.remember(stored: nil, for: .savedPage("31"))

        queue.record(nil, for: .savedPage("31"))

        XCTAssertTrue(queue.isEmpty)
    }

    /// A null is a value, not an absence: finishing an article has to reach the server, or the
    /// next visit resumes at the end of something already read.
    func testANullPositionIsQueuedWhenTheServerHoldsAFraction() {
        var queue = ReadingProgressQueue()
        queue.remember(stored: 0.42, for: .article("42"))

        queue.record(nil, for: .article("42"))

        XCTAssertEqual(
            queue.takeBatch().articles,
            [APIArticleReadingProgressEntry(articleId: "42", readingProgress: nil)]
        )
    }

    func testAnAcknowledgedPositionIsNotSentTwice() {
        var queue = ReadingProgressQueue()
        queue.record(0.42, for: .article("42"))
        let batch = queue.takeBatch()
        queue.acknowledge(articles: batch.articles)

        queue.record(0.42, for: .article("42"))

        XCTAssertTrue(queue.isEmpty)
    }

    /// The echo, not the submission, is what gets remembered — the server normalizes, and a
    /// client that remembered what it sent would keep re-sending it.
    func testTheStoredEchoIsRememberedRatherThanWhatWasSent() {
        var queue = ReadingProgressQueue()
        queue.record(0.98, for: .article("42"))
        _ = queue.takeBatch()
        queue.acknowledge(articles: [
            APIArticleReadingProgressEntry(articleId: "42", readingProgress: nil),
        ])

        queue.record(nil, for: .article("42"))

        XCTAssertTrue(queue.isEmpty, "the server said it stored null, so null is not news")
    }

    func testAFailedBatchIsRetriedOnTheNextFlush() {
        var queue = ReadingProgressQueue()
        queue.record(0.42, for: .article("42"))
        queue.record(0.8, for: .savedPage("31"))
        let batch = queue.takeBatch()

        queue.requeue(articles: batch.articles)
        queue.requeue(savedPages: batch.savedPages)

        XCTAssertFalse(queue.isEmpty)
        let retry = queue.takeBatch()
        XCTAssertEqual(retry.articles, batch.articles)
        XCTAssertEqual(retry.savedPages, batch.savedPages)
    }

    /// A reader who kept reading while the failed request was in flight must not be walked
    /// backwards by its retry.
    func testANewerPositionSurvivesTheRequeueOfAFailedOne() {
        var queue = ReadingProgressQueue()
        queue.record(0.4, for: .article("42"))
        let batch = queue.takeBatch()
        queue.record(0.7, for: .article("42"))

        queue.requeue(articles: batch.articles)

        XCTAssertEqual(queue.takeBatch().articles.first?.readingProgress, 0.7)
    }

    /// The contract caps a request at 100 entries. The overflow stays queued rather than being
    /// dropped or fired off as a second request nothing is waiting on.
    func testABatchStopsAtTheContractsCeilingAndKeepsTheRest() {
        var queue = ReadingProgressQueue()
        for index in 0 ..< 120 {
            queue.record(0.5, for: .article(String(format: "%03d", index)))
        }

        let batch = queue.takeBatch()

        XCTAssertEqual(batch.articles.count, ReadingProgressQueue.batchLimit)
        XCTAssertFalse(queue.isEmpty)
        XCTAssertEqual(queue.takeBatch().articles.count, 20)
    }

    // MARK: - The rule

    /// The same numbers the server applies, so the app never queues a write whose only effect
    /// would be to be normalized away.
    func testAPositionAtEitherEndIsWorthNothing() {
        XCTAssertNil(ReadingProgressRule.stored(0))
        XCTAssertNil(ReadingProgressRule.stored(0.05))
        XCTAssertNil(ReadingProgressRule.stored(0.95))
        XCTAssertNil(ReadingProgressRule.stored(1))
        XCTAssertEqual(ReadingProgressRule.stored(0.42), 0.42)
    }

    func testAnUnusableStoredValueIsNotResumedFrom() {
        XCTAssertNil(ReadingProgressRule.resumable(nil))
        XCTAssertNil(ReadingProgressRule.resumable(.nan))
        XCTAssertNil(ReadingProgressRule.resumable(0.02))
        XCTAssertEqual(ReadingProgressRule.resumable(0.42), 0.42)
    }

    func testAnOutOfRangePositionIsClampedRatherThanTrusted() {
        XCTAssertEqual(ReadingProgressRule.clamp(-3), 0)
        XCTAssertEqual(ReadingProgressRule.clamp(4), 1)
        XCTAssertNil(ReadingProgressRule.stored(4), "clamped to 1, which is past the ceiling")
    }
}
