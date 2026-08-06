import Foundation
@testable import Currentfold

/// Every reading-progress batch the store sent, and which of the two endpoints refuses.
///
/// The batches are kept as a list of *requests* rather than merged, because most of what is
/// worth asserting about progress sync is a claim about batching: one request per flush, the
/// newest position per row, and a refused batch coming back around on the next one.
actor ReadingProgressLog {
    static let refusal = CurrentfoldAPIError.rejected(
        status: 503,
        code: nil,
        message: "Currentfold couldn’t save that."
    )

    private var articleBatches: [[APIArticleReadingProgressEntry]] = []
    private var savedPageBatches: [[APISavedPageReadingProgressEntry]] = []
    private var refusesArticles = false
    private var refusesSavedPages = false

    func refuseArticles(_ refuses: Bool = true) {
        refusesArticles = refuses
    }

    func refuseSavedPages(_ refuses: Bool = true) {
        refusesSavedPages = refuses
    }

    /// Answers the way the contract does: with what was *stored*, which normalizes a position
    /// near either end to null.
    func recordArticles(
        _ positions: [APIArticleReadingProgressEntry]
    ) throws -> [APIArticleReadingProgressEntry] {
        articleBatches.append(positions)
        if refusesArticles {
            throw Self.refusal
        }
        return positions.map {
            APIArticleReadingProgressEntry(
                articleId: $0.articleId,
                readingProgress: ReadingProgressRule.resumable($0.readingProgress)
            )
        }
    }

    func recordSavedPages(
        _ positions: [APISavedPageReadingProgressEntry]
    ) throws -> [APISavedPageReadingProgressEntry] {
        savedPageBatches.append(positions)
        if refusesSavedPages {
            throw Self.refusal
        }
        return positions.map {
            APISavedPageReadingProgressEntry(
                savedPageId: $0.savedPageId,
                readingProgress: ReadingProgressRule.resumable($0.readingProgress)
            )
        }
    }

    func articleRequests() -> [[APIArticleReadingProgressEntry]] {
        articleBatches
    }

    func savedPageRequests() -> [[APISavedPageReadingProgressEntry]] {
        savedPageBatches
    }
}

/// A scripted `POST /subscriptions`, keyed by the address that was sent — which is the only
/// way to prove that answering the picker sends the *chosen candidate* back rather than what
/// the reader originally typed.
actor SourceDiscovery {
    private var answers: [String: Result<APISubscriptionCreationResult, CurrentfoldAPIError>] = [:]
    private var log: [String] = []

    func stub(_ address: String, _ result: APISubscriptionCreationResult) {
        answers[address] = .success(result)
    }

    func stub(_ address: String, refusal: CurrentfoldAPIError) {
        answers[address] = .failure(refusal)
    }

    func resolve(_ address: String) throws -> APISubscriptionCreationResult {
        log.append(address)
        switch answers[address] {
        case let .success(result):
            return result
        case let .failure(error):
            throw error
        case nil:
            throw CurrentfoldAPIError.rejected(
                status: 422,
                code: "feed_not_found",
                message: "No feed found at \(address)."
            )
        }
    }

    func requests() -> [String] {
        log
    }
}

extension CurrentfoldAPIError {
    static let alreadySubscribed = CurrentfoldAPIError.rejected(
        status: 409,
        code: "already_subscribed",
        message: "This account already follows that source."
    )
}
