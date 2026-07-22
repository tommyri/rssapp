import Foundation

struct APIAccount: Decodable, Equatable, Sendable {
    let id: String
    let email: String
    let displayName: String?
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
    let starred: Bool
    let readLater: Bool
    let readingProgress: Double?
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
    let audio: Audio?
    var state: APIArticleState

    var displayDate: String? {
        let value = publishedAt ?? createdAt
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: value)
        else {
            return nil
        }
        return date.formatted(.relative(presentation: .named))
    }
}

struct APIArticlePage: Decodable, Equatable, Sendable {
    struct Pagination: Decodable, Equatable, Sendable {
        let nextCursor: String?
    }

    let data: [APIArticle]
    let pagination: Pagination
}
