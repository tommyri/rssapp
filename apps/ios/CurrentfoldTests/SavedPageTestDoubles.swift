import Foundation
@testable import Currentfold

/// Scripted saved-page pages, keyed by cursor, plus the cursors the store actually asked for.
/// The unified queue's correctness is mostly a claim about *which* cursor went out when, so
/// the log matters as much as the pages.
actor SavedPageFeed {
    private var pages: [String?: APIPage<APISavedPage>] = [:]
    private var log: [String?] = []
    private var failure: CurrentfoldAPIError?

    func stub(cursor: String? = nil, _ pages: [APISavedPage], nextCursor: String? = nil) {
        self.pages[cursor] = APIPage(data: pages, pagination: .init(nextCursor: nextCursor))
    }

    func failEveryRequest(with error: CurrentfoldAPIError) {
        failure = error
    }

    func page(cursor: String?) throws -> APIPage<APISavedPage> {
        log.append(cursor)
        if let failure {
            throw failure
        }
        return pages[cursor] ?? APIPage(data: [], pagination: .init(nextCursor: nil))
    }

    func requests() -> [String?] {
        log
    }
}

/// Every saved-page mutation the store committed, and which of them the server refuses.
actor SavedPageLog {
    enum Verb: String, Sendable {
        case read
        case remove
        case retry
    }

    struct Update: Sendable, Equatable {
        let verb: Verb
        let savedPageIDs: [String]
        let value: Bool
    }

    static let refusal = CurrentfoldAPIError.rejected(
        status: 500,
        code: nil,
        message: "Currentfold couldn’t save that."
    )

    private var updates: [Update] = []
    private var refusedVerbs: Set<Verb> = []
    private var retryResult: APISavedPage?

    func refuse(_ verb: Verb) {
        refusedVerbs.insert(verb)
    }

    /// What `POST /saved-pages/{id}/retry` reports back once it has waited for the outcome.
    func answerRetry(with page: APISavedPage) {
        retryResult = page
    }

    func record(_ verb: Verb, _ savedPageIDs: [String], _ value: Bool = true) throws {
        updates.append(Update(verb: verb, savedPageIDs: savedPageIDs, value: value))
        if refusedVerbs.contains(verb) {
            throw Self.refusal
        }
    }

    func runRetry(_ savedPageID: String) throws -> APISavedPage {
        try record(.retry, [savedPageID])
        guard let retryResult else {
            throw Self.refusal
        }
        return retryResult
    }

    func recorded() -> [Update] {
        updates
    }
}

extension APISavedPage {
    /// A store-test saved page. Only what the merge and the verbs reason about varies, and
    /// `savedAt` is explicit because the interleave is decided by it.
    static func testSavedPage(
        id: String,
        savedAt: String,
        status: APISavedPageExtractionStatus = .ready,
        read: Bool = false
    ) -> APISavedPage {
        APISavedPage(
            id: id,
            url: URL(string: "https://example.org/\(id)")!,
            title: "Saved page \(id)",
            siteName: "example.org",
            author: nil,
            savedAt: savedAt,
            extraction: .init(
                status: status,
                error: status == .failed ? "Could not fetch page: HTTP 403 Forbidden" : nil
            ),
            content: .init(html: status == .ready ? "<p>Copy</p>" : nil),
            preview: status == .ready ? "A snippet." : nil,
            readingTime: status == .ready ? 2 : nil,
            state: .init(read: read, readingProgress: nil)
        )
    }
}

@MainActor
extension ReaderTestStore {
    /// The Library, opened at Read Later, with both streams stubbed and finished. The starting
    /// point for everything the unified queue does once it has loaded — the pagination tests
    /// build their own stubs, because for them the cursors are the subject.
    static func openQueue(
        articles: [APIArticle],
        savedPages: [APISavedPage],
        savedPageFeed: SavedPageFeed = SavedPageFeed(),
        savedPageLog: SavedPageLog = SavedPageLog()
    ) async -> ReaderStore {
        let feed = ArticleFeed()
        await feed.stub(.init(filter: .readLater), articles)
        await savedPageFeed.stub(savedPages)
        let store = make(feed: feed, savedPageFeed: savedPageFeed, savedPages: savedPageLog)
        await store.openList(scope: .library)
        await store.setFilter(.readLater, for: .library)
        return store
    }
}
