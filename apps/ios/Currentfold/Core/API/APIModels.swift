import Foundation

struct APIAccount: Decodable, Equatable, Sendable {
    let id: String
    let email: String
    let displayName: String?
}

struct APISessionCredential: Codable, Equatable, Sendable {
    let accessToken: String
    let accessTokenExpiresAt: String
    let refreshToken: String
    let refreshTokenExpiresAt: String
}

struct APIAuthenticationGrant: Decodable, Equatable, Sendable {
    let account: APIAccount
    let session: APISessionCredential
}

struct APIStatusMessage: Decodable, Equatable, Sendable {
    let status: String?
    let message: String
}

struct APIAuthProviders: Decodable, Equatable, Sendable {
    let apple: Bool
    let google: Bool
}

struct APIAppleChallenge: Decodable, Equatable, Sendable {
    let challenge: String
}

enum APINativeProvider: String, Encodable, Sendable {
    case apple
    case google
}

struct APIProviderSignIn: Encodable, Sendable {
    let provider: APINativeProvider
    let identityToken: String
    let challenge: String?
    let displayName: String?
    let deviceName: String
    let inviteToken: String?
}

struct APIFeed: Decodable, Hashable, Sendable {
    let id: String
    let title: String
    let url: URL
    let siteUrl: URL?
}

struct APISubscription: Decodable, Identifiable, Hashable, Sendable {
    struct FeedReference: Decodable, Hashable, Sendable {
        let id: String
        let url: URL
        let siteUrl: URL?
    }

    struct Folder: Decodable, Hashable, Sendable {
        let id: String
        let name: String
    }

    let id: String
    let title: String
    let feed: FeedReference
    let folder: Folder?
    let unreadCount: Int
    let paused: Bool
}

struct APIArticleState: Decodable, Hashable, Sendable {
    var read: Bool
    var starred: Bool
    var readLater: Bool
    /// Where reading stopped, as the server stores it — `nil` when there is nothing worth
    /// resuming. Mutable because a flush answers with the value that was *stored*, and the
    /// store keeps the echo rather than what it sent (see ``ReadingProgressRule``).
    var readingProgress: Double?
}

enum APIContentSource: String, Decodable, Sendable {
    case full
    case feed
}

struct APIArticle: Decodable, Identifiable, Hashable, Sendable {
    struct Content: Decodable, Hashable, Sendable {
        let html: String?
        let source: APIContentSource
    }

    struct Audio: Decodable, Hashable, Sendable {
        let url: URL
        let type: String?
    }

    let id: String
    let subscriptionId: String
    let title: String
    let url: URL?
    let canonicalUrl: URL?
    let author: String?
    let publishedAt: String?
    let createdAt: String
    let feed: APIFeed
    let content: Content
    /// Plain-text row snippet, already boilerplate-stripped and cut on a word boundary by
    /// the server. `nil` when the body had nothing worth previewing, which is a row that
    /// shows no snippet at all rather than an empty line.
    let preview: String?
    /// Whole minutes at 225 words per minute, or `nil` for a stub entry the contract
    /// declined to estimate.
    let readingTime: Int?
    let audio: Audio?
    var state: APIArticleState

    /// The instant the reader sorts and sweeps by. The contract orders on
    /// `coalesce(publishedAt, createdAt)`, so a local "older than" cutoff has to mean
    /// exactly the same thing or a mark-all-read would disagree with the server.
    var sortDate: Date? {
        APITimestamp.date(from: publishedAt ?? createdAt)
    }

    var displayDate: String? {
        sortDate?.formatted(.relative(presentation: .named))
    }

    /// The meta-line reading estimate, absent for an entry too short to estimate.
    var readingTimeLabel: String? {
        readingTime.map { "\($0) min read" }
    }
}

/// The one place the app reads and writes contract timestamps.
///
/// Shared because `displayDate` runs on every row render, and building a formatter is the
/// expensive part of it.
///
/// `ISO8601DateFormatter` is not `Sendable`, but Foundation's formatters are documented as
/// safe to use concurrently once configured; this one is configured inside its initializer
/// and never mutated again, so the only concurrent use is parsing. `nonisolated(unsafe)`
/// states that promise to strict concurrency explicitly instead of wrapping read-only work
/// in a lock or pinning the property to an actor the model layer has no reason to know
/// about.
enum APITimestamp {
    nonisolated(unsafe) private static let formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static func date(from value: String) -> Date? {
        formatter.date(from: value)
    }

    static func string(from date: Date) -> String {
        formatter.string(from: date)
    }
}

/// One keyset-paginated page of a reader stream.
///
/// Both streams the reader pages through — articles and saved pages — answer in this shape,
/// which is what lets the unified Read Later queue drive them through one pagination path
/// instead of two that can drift apart.
struct APIPage<Item: Decodable & Sendable>: Decodable, Sendable {
    struct Pagination: Decodable, Equatable, Sendable {
        let nextCursor: String?
    }

    let data: [Item]
    let pagination: Pagination
}

extension APIPage: Equatable where Item: Equatable {}

typealias APIArticlePage = APIPage<APIArticle>

/// Which slice of a stream a list shows. Raw values are the contract's `filter` values; the
/// deprecated `unreadOnly` parameter is never sent.
enum ArticleFilter: String, CaseIterable, Identifiable, Sendable {
    case unread
    case all
    case starred
    case readLater

    var id: String { rawValue }
}

/// Which stream a list draws from, and the identity of a loaded list in ``ReaderStore``.
/// Deliberately carries no display name: two navigations to the same source must resolve to
/// the same loaded list.
enum ArticleListScope: Hashable, Sendable {
    case library
    case subscription(id: String)
    case folder(id: String)

    var subscriptionID: String? {
        if case let .subscription(id) = self { return id }
        return nil
    }

    var folderID: String? {
        if case let .folder(id) = self { return id }
        return nil
    }

    var markAllReadScope: APIMarkAllReadScope {
        switch self {
        case .library: .all
        case .subscription: .subscription
        case .folder: .folder
        }
    }
}

/// One value describing *which* articles a request wants. Pagination stays a separate
/// argument: the cursor says where to resume, not what to ask for.
struct ArticleQuery: Hashable, Sendable {
    let scope: ArticleListScope
    let filter: ArticleFilter
}

enum APIMarkAllReadScope: String, Codable, Sendable {
    case all
    case subscription
    case folder
}

/// The scope-discriminated mark-all-read body. The server parses it as a strict discriminated
/// union, so a key that does not belong to the scope must be absent rather than null —
/// synthesized `Encodable` omits `nil` optionals, and `APIContractFixtureTests` pins that.
struct APIMarkAllReadRequest: Encodable, Equatable, Sendable {
    let scope: APIMarkAllReadScope
    let subscriptionId: String?
    let folderId: String?
    let olderThan: String?

    init(scope: ArticleListScope, olderThan: Date?) {
        self.scope = scope.markAllReadScope
        subscriptionId = scope.subscriptionID
        folderId = scope.folderID
        self.olderThan = olderThan.map(APITimestamp.string(from:))
    }
}

struct APIMarkAllReadResult: Decodable, Equatable, Sendable {
    let scope: APIMarkAllReadScope
    let subscriptionId: String?
    let folderId: String?
    let olderThan: String?
    let markedCount: Int
}

/// The three batched state mutations share one shape. They live beside the models rather
/// than inside the client so contract fixtures can be round-tripped against them.
struct APIReadStateUpdate: Codable, Equatable, Sendable {
    let articleIds: [String]
    let read: Bool
}

struct APIStarredStateUpdate: Codable, Equatable, Sendable {
    let articleIds: [String]
    let starred: Bool
}

struct APIReadLaterStateUpdate: Codable, Equatable, Sendable {
    let articleIds: [String]
    let readLater: Bool
}
