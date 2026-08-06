import Foundation

/// Which stream a row came from, and its id inside that stream.
///
/// The two id spaces are separate on the wire — an article id and a saved-page id can collide
/// harmlessly — so a queue that mixes them needs an identity that says which.
enum ReaderEntryID: Hashable, Sendable {
    case article(String)
    case savedPage(String)
}

/// One row of a reader list.
///
/// Every list in the app is entirely articles except one: the Library's Read Later view, which
/// is the unified queue and is where a saved page appears, interleaved by date.
enum ReaderEntry: Identifiable, Hashable, Sendable {
    case article(APIArticle)
    case savedPage(SavedPageEntry)

    var id: ReaderEntryID {
        switch self {
        case let .article(article): .article(article.id)
        case let .savedPage(entry): .savedPage(entry.id)
        }
    }

    var article: APIArticle? {
        if case let .article(article) = self { return article }
        return nil
    }

    var savedPage: SavedPageEntry? {
        if case let .savedPage(entry) = self { return entry }
        return nil
    }
}

/// A saved page as the reader sees it: the contract's row plus the two pieces of state that
/// belong to this session alone and never reach the server.
struct SavedPageEntry: Identifiable, Hashable, Sendable {
    let page: APISavedPage

    /// Removed during this visit. The row stays exactly where it is — a list never
    /// rearranges itself under a reader, see ``ReaderStore`` — and says so, until a
    /// deliberate reload drops it.
    let isRemoved: Bool

    /// A retry is in flight. The row reads as "fetching" rather than as failed, because it is.
    let isRetrying: Bool

    var id: String { page.id }

    /// What the row and the detail view show in place of a copy. Retrying outranks the stored
    /// status: the reader just asked for another attempt and should see one happening.
    var copyState: CopyState {
        if isRetrying { return .fetching }
        switch page.extraction.status {
        case .pending: return .fetching
        case .ready: return .ready
        case .failed: return .failed(page.extraction.error)
        }
    }

    enum CopyState: Hashable, Sendable {
        case fetching
        case ready
        case failed(String?)
    }
}
