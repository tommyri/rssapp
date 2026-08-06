import Foundation

/// What counts as a resume position, decided in exactly one place.
///
/// The server already applies this rule — `PATCH …/reading-progress` answers with the value it
/// *stored*, not the value it was sent, normalizing a fraction near either end to null because
/// resuming at the very top or the very end is worse than not resuming. The app keeps the same
/// numbers so it does not queue a write whose only effect would be to be normalized away, and
/// so a locally-known position and a server-known one mean the same thing.
enum ReadingProgressRule {
    /// Below this the reader has barely started; at or above ``complete`` they have finished.
    static let minimum = 0.05
    static let complete = 0.95

    /// What the server will keep for a live position. Mirrors the web's `storedReadingProgress`.
    static func stored(_ progress: Double) -> Double? {
        resumable(progress)
    }

    /// The position worth scrolling back to, or `nil` when there is nothing useful to resume.
    static func resumable(_ progress: Double?) -> Double? {
        guard let progress, progress.isFinite else { return nil }
        let clamped = clamp(progress)
        return clamped > minimum && clamped < complete ? clamped : nil
    }

    static func clamp(_ value: Double) -> Double {
        min(1, max(0, value))
    }
}

/// One article's resume position, as the batched endpoint carries it in both directions.
///
/// `readingProgress` is required *and* nullable: "there is nothing worth resuming" is a value
/// the server has to be told, not a key to leave out. Synthesized `Encodable` omits a nil
/// optional, which would read as "leave this one alone", so the coding is written by hand.
struct APIArticleReadingProgressEntry: Codable, Equatable, Sendable {
    let articleId: String
    let readingProgress: Double?

    init(articleId: String, readingProgress: Double?) {
        self.articleId = articleId
        self.readingProgress = readingProgress
    }

    private enum CodingKeys: String, CodingKey {
        case articleId
        case readingProgress
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        articleId = try container.decode(String.self, forKey: .articleId)
        readingProgress = try container.decodeIfPresent(Double.self, forKey: .readingProgress)
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(articleId, forKey: .articleId)
        if let readingProgress {
            try container.encode(readingProgress, forKey: .readingProgress)
        } else {
            try container.encodeNil(forKey: .readingProgress)
        }
    }
}

/// The saved-page counterpart. Same rules, different id key, because the two streams are
/// separate tables — see ``APISavedPageReadStateUpdate`` for the same split.
struct APISavedPageReadingProgressEntry: Codable, Equatable, Sendable {
    let savedPageId: String
    let readingProgress: Double?

    init(savedPageId: String, readingProgress: Double?) {
        self.savedPageId = savedPageId
        self.readingProgress = readingProgress
    }

    private enum CodingKeys: String, CodingKey {
        case savedPageId
        case readingProgress
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        savedPageId = try container.decode(String.self, forKey: .savedPageId)
        readingProgress = try container.decodeIfPresent(Double.self, forKey: .readingProgress)
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(savedPageId, forKey: .savedPageId)
        if let readingProgress {
            try container.encode(readingProgress, forKey: .readingProgress)
        } else {
            try container.encodeNil(forKey: .readingProgress)
        }
    }
}

/// One batch of article positions. The ids have to be distinct — two positions for one article
/// contradict each other, and the contract rejects the request rather than picking a winner.
struct APIArticleReadingProgressUpdate: Codable, Equatable, Sendable {
    let positions: [APIArticleReadingProgressEntry]
}

struct APISavedPageReadingProgressUpdate: Codable, Equatable, Sendable {
    let positions: [APISavedPageReadingProgressEntry]
}
