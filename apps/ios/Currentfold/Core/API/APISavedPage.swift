import Foundation

/// How far the server has got fetching a saved page's readable copy.
///
/// Three values, and the mapping is not the stored one: a retryable failure still inside its
/// backoff reports `pending` with no error, because telling a reader about a problem the
/// poller is about to undo is noise. `failed` is terminal until a deliberate retry.
enum APISavedPageExtractionStatus: String, Decodable, Sendable {
    case pending
    case ready
    case failed
}

/// A saved page's state, which is deliberately shorter than an article's.
///
/// There is no `readLater` flag and no star: a saved page is *in* Read later by existing, so
/// there is nothing to clear and Remove — `DELETE /saved-pages/{id}` — is its only exit.
struct APISavedPageState: Decodable, Hashable, Sendable {
    var read: Bool
    /// Mutable for the same reason ``APIArticleState/readingProgress`` is: the store keeps the
    /// position the server said it stored, not the one the reader scrolled to.
    var readingProgress: Double?
}

/// A page the reader saved from anywhere, as `GET /api/v1/saved-pages` returns it.
///
/// Every field a row needs is present before extraction finishes — `title` falls back to the
/// URL and `siteName` to its host — so the queue can draw a saved page the instant it is
/// saved rather than showing a placeholder until a copy lands.
struct APISavedPage: Decodable, Identifiable, Hashable, Sendable {
    struct Extraction: Decodable, Hashable, Sendable {
        let status: APISavedPageExtractionStatus
        /// Why the copy could not be fetched. Non-null only when ``status`` is `failed`.
        let error: String?
    }

    struct Content: Decodable, Hashable, Sendable {
        /// Sanitized readable copy, safe to render exactly like feed content. `nil` until
        /// the extraction is `ready`.
        let html: String?
    }

    let id: String
    /// The canonicalized address, and the Open Original target.
    let url: URL
    let title: String
    /// What a saved-page row shows where a feed article shows its feed.
    let siteName: String
    let author: String?
    let savedAt: String
    var extraction: Extraction
    var content: Content
    var preview: String?
    var readingTime: Int?
    var state: APISavedPageState

    /// The instant this row sorts by, and the value the unified queue compares against an
    /// article's ``APIArticle/sortDate``.
    var savedDate: Date? {
        APITimestamp.date(from: savedAt)
    }

    var displayDate: String? {
        savedDate?.formatted(.relative(presentation: .named))
    }

    var readingTimeLabel: String? {
        readingTime.map { "\($0) min read" }
    }
}

/// The body of `POST /api/v1/saved-pages`.
///
/// A string rather than a `URL` because the share sheet hands over whatever the sending app
/// had, and the server owns canonicalization — re-normalizing it here would mean two
/// canonicalizers to keep in step.
struct APISavedPageCreation: Encodable, Equatable, Sendable {
    let url: String

    init(url: URL) {
        self.url = url.absoluteString
    }
}

/// The answer to a save, which arrives *before* extraction runs so a share sheet can dismiss.
///
/// `alreadySaved` distinguishes the `200` (this URL was in the queue already, nothing was
/// re-fetched) from the `201`, and both carry the row.
struct APISavedPageCreationResult: Decodable, Equatable, Sendable {
    let alreadySaved: Bool
    let savedPage: APISavedPage
}

/// The answer to `POST /api/v1/saved-pages/{id}/retry`, which unlike saving waits for the
/// outcome and reports the page it ended up with.
struct APISavedPageEnvelope: Decodable, Equatable, Sendable {
    let savedPage: APISavedPage
}

/// The saved-page half of the batched read-state mutation. Same shape as
/// ``APIReadStateUpdate``, different id key, because the two streams are separate tables.
struct APISavedPageReadStateUpdate: Codable, Equatable, Sendable {
    let savedPageIds: [String]
    let read: Bool
}
