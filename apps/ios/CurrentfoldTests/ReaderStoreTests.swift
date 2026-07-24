import XCTest
@testable import Currentfold

@MainActor
final class ReaderStoreTests: XCTestCase {
    func testReadArticleCanBeMarkedUnread() async throws {
        let recorder = ReadStateRecorder()
        var apiClient = PreviewFixtures.apiClient
        apiClient.updateReadState = { _, articleIDs, read in
            await recorder.record(articleIDs: articleIDs, read: read)
        }
        var article = APIArticle.fixture
        article.state.read = true
        let store = ReaderStore(
            apiClient: apiClient,
            connection: PreviewFixtures.connection,
            articles: [article],
            articleState: .loaded,
            subscriptionState: .loaded
        )

        await store.setRead(articleID: article.id, read: false)

        XCTAssertFalse(try XCTUnwrap(store.article(id: article.id)).state.read)
        let recordedUpdate = await recorder.lastUpdate()
        let update = try XCTUnwrap(recordedUpdate)
        XCTAssertEqual(update.articleIDs, [article.id])
        XCTAssertFalse(update.read)
    }
}

private actor ReadStateRecorder {
    struct Update: Sendable {
        let articleIDs: [String]
        let read: Bool
    }

    private var updates: [Update] = []

    func record(articleIDs: [String], read: Bool) {
        updates.append(Update(articleIDs: articleIDs, read: read))
    }

    func lastUpdate() -> Update? {
        updates.last
    }
}
