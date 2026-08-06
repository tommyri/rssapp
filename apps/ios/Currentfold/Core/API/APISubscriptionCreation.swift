import Foundation

/// The body of `POST /api/v1/subscriptions`.
///
/// A string rather than a `URL`, for the same reason ``APISavedPageCreation`` is: the reader
/// pastes whatever they have — a bare host, a site, a feed address, a YouTube handle — and the
/// server owns both canonicalization and discovery. Adding a scheme here would mean two
/// normalizers to keep in step, and would turn "example.com" into a client-side failure before
/// the endpoint that knows how to resolve it ever saw it.
struct APISubscriptionCreation: Encodable, Equatable, Sendable {
    let url: String
}

/// One feed a page advertised, when it advertised more than one.
///
/// The title is the label the page gave the feed, which is how "Posts" is told from
/// "Comments". Null means the page did not label it, and the URL is shown instead.
struct APIFeedCandidate: Decodable, Identifiable, Hashable, Sendable {
    let url: URL
    let title: String?

    var id: URL { url }

    /// What the picker row leads with. A candidate without a label is still choosable — the
    /// address is the only thing that distinguishes it, so the address is the title.
    var displayTitle: String {
        guard let title, !title.isEmpty else { return url.absoluteString }
        return title
    }

    /// The second line, dropped when it would only repeat the first.
    var displayDetail: String? {
        displayTitle == url.absoluteString ? nil : url.absoluteString
    }
}

/// What a pasted URL turned into.
///
/// Two outcomes are successful and the contract tells them apart by `data.status` rather than
/// by the status code, because `candidates` is a question rather than a failure: nothing was
/// subscribed, and answering means POSTing the chosen candidate URL back to the same endpoint.
/// The two failures — already following, and no feed found — arrive as errors and are handled
/// where errors are.
enum APISubscriptionCreationResult: Decodable, Equatable, Sendable {
    case subscribed(APISubscription)
    case candidates([APIFeedCandidate])

    private enum CodingKeys: String, CodingKey {
        case status
        case subscription
        case candidates
    }

    private enum Status: String, Decodable {
        case subscribed
        case candidates
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Status.self, forKey: .status) {
        case .subscribed:
            self = .subscribed(try container.decode(APISubscription.self, forKey: .subscription))
        case .candidates:
            self = .candidates(
                try container.decode([APIFeedCandidate].self, forKey: .candidates)
            )
        }
    }
}
