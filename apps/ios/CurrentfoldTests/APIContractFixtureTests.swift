import XCTest
@testable import Currentfold

final class APIContractFixtureTests: XCTestCase {
    func testDecodesTheSharedArticlePageFixture() throws {
        let page: APIArticlePage = try decodeFixture("article-page")

        XCTAssertEqual(page.data.map(\.id), ["42"])
        XCTAssertEqual(page.data.first?.feed.title, "Example Source")
        XCTAssertEqual(page.data.first?.content.source, .full)
        XCTAssertNil(page.pagination.nextCursor)
    }

    /// `preview` and `readingTime` are what the row recipe is built on, so the fixture has to
    /// keep carrying them in the shape the rows assume.
    func testDecodesTheRowFieldsOfTheArticleFixture() throws {
        let page: APIArticlePage = try decodeFixture("article-page")
        let article = try XCTUnwrap(page.data.first)

        let preview = try XCTUnwrap(article.preview)
        XCTAssertTrue(preview.hasPrefix("A durable readable copy is kept"))
        XCTAssertLessThanOrEqual(preview.count, 221)
        XCTAssertEqual(article.readingTime, 1)
        XCTAssertEqual(article.readingTimeLabel, "1 min read")
        XCTAssertNotNil(article.content.html, "the list still carries the full copy")
    }

    // MARK: - State mutations

    func testReadStateFixturesRoundTrip() throws {
        try assertEncoding(
            APIReadStateUpdate(articleIds: ["42", "43"], read: true),
            matches: "read-state-request"
        )
    }

    func testStarredStateFixturesRoundTrip() throws {
        let update = APIStarredStateUpdate(articleIds: ["42", "43"], starred: true)
        try assertEncoding(update, matches: "starred-state-request")

        let response: DataEnvelope<APIStarredStateUpdate> =
            try decodeFixture("starred-state-response")
        XCTAssertEqual(response.data, update)
    }

    func testReadLaterStateFixturesRoundTrip() throws {
        let update = APIReadLaterStateUpdate(articleIds: ["42", "43"], readLater: true)
        try assertEncoding(update, matches: "read-later-state-request")

        let response: DataEnvelope<APIReadLaterStateUpdate> =
            try decodeFixture("read-later-state-response")
        XCTAssertEqual(response.data, update)
    }

    // MARK: - Mark all read

    func testMarkAllReadRequestFixtureRoundTrips() throws {
        let olderThan = try XCTUnwrap(APITimestamp.date(from: "2026-07-22T12:00:00.000Z"))
        try assertEncoding(
            APIMarkAllReadRequest(scope: .subscription(id: "7"), olderThan: olderThan),
            matches: "mark-all-read-request"
        )
    }

    func testMarkAllReadResponseFixtureDecodes() throws {
        let response: DataEnvelope<APIMarkAllReadResult> =
            try decodeFixture("mark-all-read-response")

        XCTAssertEqual(response.data.scope, .subscription)
        XCTAssertEqual(response.data.subscriptionId, "7")
        XCTAssertNil(response.data.folderId)
        XCTAssertEqual(response.data.olderThan, "2026-07-22T12:00:00.000Z")
        XCTAssertEqual(response.data.markedCount, 12)
    }

    /// The server parses the body as a strict discriminated union, so a key belonging to another
    /// scope must be absent rather than null.
    func testMarkAllReadOmitsTheKeysItsScopeDoesNotOwn() throws {
        let encoded = try encodedObject(APIMarkAllReadRequest(scope: .library, olderThan: nil))
        XCTAssertEqual(encoded, ["scope": "all"] as NSDictionary)

        let folder = try encodedObject(
            APIMarkAllReadRequest(scope: .folder(id: "3"), olderThan: nil)
        )
        XCTAssertEqual(folder, ["scope": "folder", "folderId": "3"] as NSDictionary)
    }

    // MARK: - Saved pages

    /// The shared page fixture carries one row in each extraction state on purpose, and each
    /// one is a different set of nulls the row recipe has to survive.
    func testDecodesTheSharedSavedPageFixture() throws {
        let page: APIPage<APISavedPage> = try decodeFixture("saved-page-page")

        XCTAssertEqual(page.data.map(\.id), ["31", "30", "29"])
        XCTAssertEqual(page.data.map(\.extraction.status), [.ready, .pending, .failed])
        XCTAssertNotNil(page.pagination.nextCursor)

        let ready = try XCTUnwrap(page.data.first)
        XCTAssertEqual(ready.siteName, "Example Essays")
        XCTAssertEqual(ready.readingTime, 1)
        XCTAssertEqual(ready.readingTimeLabel, "1 min read")
        XCTAssertNotNil(ready.content.html)
        XCTAssertNil(ready.extraction.error)
        XCTAssertEqual(ready.state.readingProgress, 0.42)
        XCTAssertLessThanOrEqual(try XCTUnwrap(ready.preview).count, 221)
    }

    /// A page still being fetched has to draw before extraction finishes: the title falls
    /// back to the URL and the site name to its host, and everything the copy would have
    /// produced is null.
    func testAPendingSavedPageStillCarriesEnoughToDrawARow() throws {
        let page: APIPage<APISavedPage> = try decodeFixture("saved-page-page")
        let pending = try XCTUnwrap(page.data.first { $0.extraction.status == .pending })

        XCTAssertEqual(pending.title, pending.url.absoluteString)
        XCTAssertEqual(pending.siteName, "example.net")
        XCTAssertNil(pending.content.html)
        XCTAssertNil(pending.preview)
        XCTAssertNil(pending.readingTime)
        XCTAssertNil(pending.extraction.error, "a pending page withholds its transient error")
        XCTAssertNotNil(pending.savedDate)
    }

    func testAFailedSavedPageCarriesItsReason() throws {
        let page: APIPage<APISavedPage> = try decodeFixture("saved-page-page")
        let failed = try XCTUnwrap(page.data.first { $0.extraction.status == .failed })

        XCTAssertEqual(failed.extraction.error, "Could not fetch page: HTTP 403 Forbidden")
        XCTAssertNil(failed.content.html)
    }

    func testSavedPageCreationFixturesRoundTrip() throws {
        let url = try XCTUnwrap(URL(string: "https://example.org/essays/the-quiet-web"))
        try assertEncoding(APISavedPageCreation(url: url), matches: "saved-page-create-request")

        let response: DataEnvelope<APISavedPageCreationResult> =
            try decodeFixture("saved-page-create-response")
        XCTAssertFalse(response.data.alreadySaved)
        XCTAssertEqual(response.data.savedPage.id, "31")
        XCTAssertEqual(response.data.savedPage.extraction.status, .pending)
    }

    /// Retry waits for the outcome, so its answer is one page rather than a stream.
    func testSavedPageRetryResponseFixtureDecodes() throws {
        let response: DataEnvelope<APISavedPageEnvelope> = try decodeFixture("saved-page-response")

        XCTAssertEqual(response.data.savedPage.id, "29")
        XCTAssertEqual(response.data.savedPage.extraction.status, .ready)
        XCTAssertNotNil(response.data.savedPage.content.html)
        XCTAssertTrue(response.data.savedPage.state.read)
    }

    func testSavedPageReadStateFixturesRoundTrip() throws {
        let update = APISavedPageReadStateUpdate(savedPageIds: ["31", "30"], read: true)
        try assertEncoding(update, matches: "saved-page-read-state-request")

        let response: DataEnvelope<APISavedPageReadStateUpdate> =
            try decodeFixture("saved-page-read-state-response")
        XCTAssertEqual(response.data, update)
    }

    // MARK: - Timestamps

    /// `displayDate` now parses through a shared formatter; it must still produce exactly
    /// what a freshly configured `ISO8601DateFormatter` produced per call.
    func testDisplayDateMatchesAFreshlyBuiltFormatter() throws {
        let article = APIArticle.fixture
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let published = try XCTUnwrap(article.publishedAt)
        let expected = try XCTUnwrap(formatter.date(from: published))
            .formatted(.relative(presentation: .named))

        XCTAssertEqual(article.displayDate, expected)
    }

    func testTimestampsRoundTripThroughTheSharedFormatter() throws {
        let value = "2026-07-22T12:00:00.000Z"
        let date = try XCTUnwrap(APITimestamp.date(from: value))

        XCTAssertEqual(APITimestamp.string(from: date), value)
    }

    func testDisplayDateIsNilWhenNeitherTimestampParses() {
        let fixture = APIArticle.fixture
        let article = APIArticle(
            id: fixture.id,
            subscriptionId: fixture.subscriptionId,
            title: fixture.title,
            url: fixture.url,
            canonicalUrl: fixture.canonicalUrl,
            author: fixture.author,
            publishedAt: "not-a-timestamp",
            createdAt: "not-a-timestamp-either",
            feed: fixture.feed,
            content: fixture.content,
            preview: fixture.preview,
            readingTime: fixture.readingTime,
            audio: fixture.audio,
            state: fixture.state
        )

        XCTAssertNil(article.sortDate)
        XCTAssertNil(article.displayDate)
    }

    /// The shared formatter is read from whatever context renders a row, so parsing has to
    /// hold up under concurrent readers.
    func testDisplayDateSurvivesConcurrentReaders() async {
        let article = APIArticle.fixture
        let values = await withTaskGroup(of: String?.self) { group -> [String?] in
            for _ in 0 ..< 64 {
                group.addTask { article.displayDate }
            }
            var collected: [String?] = []
            for await value in group {
                collected.append(value)
            }
            return collected
        }

        XCTAssertEqual(values.count, 64)
        XCTAssertTrue(values.allSatisfy { $0 != nil })
    }
}
