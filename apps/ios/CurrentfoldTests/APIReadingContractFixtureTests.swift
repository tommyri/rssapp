import XCTest
@testable import Currentfold

/// Contract fixtures for the two calls whose answer is a *correction* rather than a
/// confirmation: discovery answers with the feed it resolved (or with a question), and reading
/// progress answers with the position it stored rather than the one it was sent.
///
/// Split from ``APIContractFixtureTests`` because that class had grown past what one class is
/// allowed to be, and this is where the seam already was — the same seam
/// `CurrentfoldAPIClient+Reading.swift` is cut along.
final class APIReadingContractFixtureTests: XCTestCase {
    // MARK: - Adding a source

    func testSubscriptionCreateRequestFixtureRoundTrips() throws {
        try assertEncoding(
            APISubscriptionCreation(url: "https://example.com"),
            matches: "subscription-create-request"
        )
    }

    /// The `201` carries a subscription in exactly the shape `GET /subscriptions` returns, so
    /// one decoded type covers both and the new source can join the list without a refetch.
    func testSubscribedResponseFixtureDecodes() throws {
        let response: DataEnvelope<APISubscriptionCreationResult> =
            try decodeFixture("subscription-created-response")

        guard case let .subscribed(subscription) = response.data else {
            return XCTFail("expected the subscribed outcome")
        }
        XCTAssertEqual(subscription.id, "7")
        XCTAssertEqual(subscription.title, "Example Source")
        XCTAssertEqual(subscription.feed.url.absoluteString, "https://example.com/feed.xml")
        XCTAssertNil(subscription.folder)
        XCTAssertEqual(subscription.unreadCount, 25)
    }

    /// The `200` is a question: nothing was subscribed. A candidate the page did not label
    /// still has to be choosable, which is why the row falls back to the URL.
    func testCandidatesResponseFixtureDecodes() throws {
        let response: DataEnvelope<APISubscriptionCreationResult> =
            try decodeFixture("subscription-candidates-response")

        guard case let .candidates(candidates) = response.data else {
            return XCTFail("expected the candidates outcome")
        }
        XCTAssertEqual(candidates.count, 3)
        XCTAssertEqual(candidates.first?.displayTitle, "Example Source — Posts")
        XCTAssertEqual(candidates.first?.displayDetail, "https://example.com/feed.xml")

        let unlabelled = try XCTUnwrap(candidates.last)
        XCTAssertNil(unlabelled.title)
        XCTAssertEqual(unlabelled.displayTitle, "https://example.com/notes.json")
        XCTAssertNil(unlabelled.displayDetail, "the address is already the title")
    }

    // MARK: - Reading progress

    func testArticleReadingProgressFixturesRoundTrip() throws {
        try assertEncoding(
            APIArticleReadingProgressUpdate(positions: [
                APIArticleReadingProgressEntry(articleId: "42", readingProgress: 0.42),
                APIArticleReadingProgressEntry(articleId: "43", readingProgress: 0.98),
            ]),
            matches: "article-reading-progress-request"
        )

        let response: DataEnvelope<APIArticleReadingProgressUpdate> =
            try decodeFixture("article-reading-progress-response")
        XCTAssertEqual(response.data.positions.map(\.articleId), ["42", "43"])
        XCTAssertEqual(response.data.positions.first?.readingProgress, 0.42)
        XCTAssertNil(
            response.data.positions.last?.readingProgress,
            "0.98 is past the resume ceiling, so what was stored is null"
        )
    }

    func testSavedPageReadingProgressFixturesRoundTrip() throws {
        let update = APISavedPageReadingProgressUpdate(positions: [
            APISavedPageReadingProgressEntry(savedPageId: "31", readingProgress: 0.42),
            APISavedPageReadingProgressEntry(savedPageId: "30", readingProgress: nil),
        ])
        try assertEncoding(update, matches: "saved-page-reading-progress-request")

        let response: DataEnvelope<APISavedPageReadingProgressUpdate> =
            try decodeFixture("saved-page-reading-progress-response")
        XCTAssertEqual(response.data, update)
    }

    /// "Nothing worth resuming" is a value the server has to be *told*. Synthesized
    /// `Encodable` omits a nil optional, which the contract would read as "leave it alone", so
    /// the null has to survive encoding — the saved-page fixture above only passes because of
    /// this, and this says so directly.
    func testANullPositionIsWrittenRatherThanOmitted() throws {
        let encoded = try encodedObject(
            APISavedPageReadingProgressEntry(savedPageId: "30", readingProgress: nil)
        )
        let entry = try XCTUnwrap(encoded)

        XCTAssertTrue(entry.allKeys.contains { $0 as? String == "readingProgress" })
        XCTAssertTrue(entry["readingProgress"] is NSNull)
    }
}
