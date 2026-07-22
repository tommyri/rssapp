import XCTest
@testable import Currentfold

final class APIContractFixtureTests: XCTestCase {
    func testDecodesTheSharedArticlePageFixture() throws {
        let fixtureURL = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "article-page", withExtension: "json")
        )
        let page = try JSONDecoder().decode(
            APIArticlePage.self,
            from: Data(contentsOf: fixtureURL)
        )

        XCTAssertEqual(page.data.map(\.id), ["42"])
        XCTAssertEqual(page.data.first?.feed.title, "Example Source")
        XCTAssertEqual(page.data.first?.content.source, .full)
        XCTAssertNil(page.pagination.nextCursor)
    }
}
