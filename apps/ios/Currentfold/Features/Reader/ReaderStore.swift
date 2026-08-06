import Foundation
import Observation

enum ReaderLoadState: Equatable {
    case idle
    case loading
    case loaded
    case failed(String)
}

/// Everything a list view needs to render, resolved from the store's normalized state.
struct ReaderListSnapshot: Equatable {
    var filter: ArticleFilter
    var entries: [ReaderEntry]
    var loadState: ReaderLoadState
    var isLoadingMore: Bool

    /// The article half of the list, in list order. Every list but the unified Read Later
    /// queue is entirely articles, so there this is the whole thing.
    var articles: [APIArticle] { entries.compactMap(\.article) }
}

/// The reader's state for a whole session.
///
/// Rows are stored once, keyed by id; a list is an ordered set of those ids plus its own
/// filter and cursors. That is what makes a mutation made in one list visible in every other
/// loaded list — including the one behind a `NavigationStack` push — because there is only
/// ever one copy of a row's state to change.
///
/// There are **two** normalized entities: feed articles and saved pages. They are separate
/// tables on the server, they sort by different columns, and exactly one list mixes them —
/// see ``ReaderEntryMerge`` for how the Library's Read Later view interleaves the two streams
/// without ever showing a row that an unfetched row would have to sort above.
///
/// Lists deliberately do **not** drop a row when its state stops matching the filter. An
/// article read while its unread list is on screen stays in place, rendered read, until the
/// list is reloaded — pull-to-refresh, a fresh visit, or a filter switch. Opening an article
/// auto-marks it read, so without this the list would eat rows out from under the reader.
/// The rule belongs to the list rather than to the unread filter, so unstarring inside
/// Starred and *removing* inside Read Later behave the same way: a removed saved page keeps
/// its place and says it is removed rather than collapsing the rows underneath it.
@MainActor
@Observable
final class ReaderStore {
    /// The reader's own default. The contract defaults to `all`; we are an inbox product.
    static let defaultFilter: ArticleFilter = .unread

    private(set) var subscriptions: [APISubscription]
    private(set) var subscriptionState: ReaderLoadState
    private(set) var mutationError: String?

    /// The single source of truth for article content and state.
    ///
    /// Nothing is evicted for the life of a session: an article can be open in the detail
    /// view while the list behind it refreshes it away, and that reader should keep reading.
    /// The upper bound is what one session paged in.
    ///
    /// Internal rather than private because the verbs live next door — the two `ReaderStore+`
    /// files are the rest of this type, not clients of it, and nothing outside them touches
    /// either dictionary directly.
    var articlesByID: [String: APIArticle] = [:]

    /// The saved-page half of the same idea, owned by `ReaderStore+SavedPages.swift`.
    var savedPagesByID: [String: APISavedPage] = [:]
    var removedSavedPageIDs: Set<String> = []
    var retryingSavedPageIDs: Set<String> = []

    /// Resume positions waiting to be written, for both kinds of row. Owned here rather than
    /// by the screen that produced them so a position survives the screen — see
    /// `ReaderStore+ReadingProgress.swift`.
    var readingProgress = ReadingProgressQueue()
    /// The flush in flight, so the next one queues behind it instead of being dropped.
    var readingProgressFlush: Task<Void, Never>?

    private var lists: [ArticleListScope: ReaderList] = [:]

    let apiClient: CurrentfoldAPIClient
    let connection: CurrentfoldConnection

    init(
        apiClient: CurrentfoldAPIClient,
        connection: CurrentfoldConnection,
        articles: [APIArticle] = [],
        savedPages: [APISavedPage] = [],
        subscriptions: [APISubscription] = [],
        articleState: ReaderLoadState = .idle,
        subscriptionState: ReaderLoadState = .idle,
        scope: ArticleListScope = .library,
        filter: ArticleFilter = ReaderStore.defaultFilter
    ) {
        self.apiClient = apiClient
        self.connection = connection
        self.subscriptions = subscriptions
        self.subscriptionState = subscriptionState
        remember(articles)
        remember(savedPages: savedPages)
        if articleState != .idle || !articles.isEmpty || !savedPages.isEmpty {
            var list = ReaderList(scope: scope, filter: filter)
            // Both streams are handed their whole contents at once, with no cursor: seeded
            // state is a finished list, which is what a preview and a test want.
            list.merge.acceptArticles(articles.map(Self.item(for:)), nextCursor: nil)
            list.merge.acceptSavedPages(savedPages.map(Self.item(for:)), nextCursor: nil)
            list.loadState = articleState
            lists[scope] = list
        }
    }

    // MARK: - Reading

    func list(for scope: ArticleListScope) -> ReaderListSnapshot {
        guard let list = lists[scope] else {
            return ReaderListSnapshot(
                filter: Self.defaultFilter,
                entries: [],
                loadState: .idle,
                isLoadingMore: false
            )
        }
        return ReaderListSnapshot(
            filter: list.filter,
            entries: list.merge.entryIDs.compactMap(entry(for:)),
            loadState: list.loadState,
            isLoadingMore: list.isLoadingMore
        )
    }

    func entry(for id: ReaderEntryID) -> ReaderEntry? {
        switch id {
        case let .article(articleID):
            articlesByID[articleID].map(ReaderEntry.article)
        case let .savedPage(savedPageID):
            savedPage(id: savedPageID).map(ReaderEntry.savedPage)
        }
    }

    func article(id: String) -> APIArticle? {
        articlesByID[id]
    }

    /// Unread articles across every subscription filed in a folder, for a Sources heading.
    func unreadCount(inFolder folderID: String) -> Int {
        subscriptions
            .filter { $0.folder?.id == folderID }
            .reduce(0) { $0 + $1.unreadCount }
    }

    func clearMutationError() {
        mutationError = nil
    }

    func reportMutationFailure(_ message: String?) {
        mutationError = message
    }

    struct ReaderList {
        var filter: ArticleFilter
        var merge: ReaderEntryMerge
        var loadState: ReaderLoadState = .idle
        var isLoadingMore = false
        /// Bumped by every deliberate reload so a slower in-flight page cannot land on top
        /// of a newer one — the filter switcher makes that race easy to hit.
        var revision = 0

        init(scope: ArticleListScope, filter: ArticleFilter) {
            self.filter = filter
            merge = ReaderEntryMerge(
                includesSavedPages: ReaderStore.mergesSavedPages(scope: scope, filter: filter)
            )
        }
    }

    /// Saved pages join a list in exactly one place: the Library's Read Later view. A saved
    /// page belongs to no source and no folder, so a per-source Read Later stays
    /// articles-only rather than pretending a loose link came out of a feed.
    nonisolated static func mergesSavedPages(
        scope: ArticleListScope,
        filter: ArticleFilter
    ) -> Bool {
        scope == .library && filter == .readLater
    }

    static func item(for article: APIArticle) -> ReaderEntryMerge.Item {
        ReaderEntryMerge.Item(id: article.id, date: article.sortDate)
    }

    static func item(for page: APISavedPage) -> ReaderEntryMerge.Item {
        ReaderEntryMerge.Item(id: page.id, date: page.savedDate)
    }

    func remember(_ articles: [APIArticle]) {
        for article in articles {
            articlesByID[article.id] = article
        }
    }

    func apply(
        _ value: Bool,
        to flag: WritableKeyPath<APIArticleState, Bool>,
        on articleID: String
    ) {
        guard var article = articlesByID[articleID] else { return }
        article.state[keyPath: flag] = value
        articlesByID[articleID] = article
    }
}

// MARK: - Loading

extension ReaderStore {
    /// Loads the account-wide data every tab depends on. Article lists load themselves, so
    /// each one can decide what a fresh visit means.
    func bootstrap() async {
        guard subscriptionState == .idle else { return }
        await loadSubscriptions()
    }

    /// A view is presenting this list for the first time in its lifetime. A list that has
    /// never loaded loads; one that is still around from an earlier visit reloads, which is
    /// what clears the rows read during that visit.
    func openList(scope: ArticleListScope) async {
        if lists[scope] == nil {
            lists[scope] = ReaderList(scope: scope, filter: Self.defaultFilter)
        }
        await load(scope: scope)
    }

    /// Pull-to-refresh: the deliberate "show me what is actually unread" gesture.
    func reload(scope: ArticleListScope) async {
        guard lists[scope] != nil else {
            await openList(scope: scope)
            return
        }
        await load(scope: scope)
    }

    /// Switching views is a reload, not a client-side filter: pagination restarts, both
    /// streams restart with it, and the previous visit's read rows go too.
    func setFilter(_ filter: ArticleFilter, for scope: ArticleListScope) async {
        guard let list = lists[scope] else {
            lists[scope] = ReaderList(scope: scope, filter: filter)
            await load(scope: scope)
            return
        }
        guard list.filter != filter else { return }
        var replacement = ReaderList(scope: scope, filter: filter)
        replacement.revision = list.revision
        lists[scope] = replacement
        await load(scope: scope)
    }

    /// Called from the last visible row. Pages whichever streams are holding the queue up —
    /// usually one, and never a stream that still has rows in hand.
    func loadMoreIfNeeded(scope: ArticleListScope, currentEntryID: ReaderEntryID) async {
        guard let list = lists[scope],
              currentEntryID == list.merge.lastEntryID,
              list.merge.canLoadMore,
              !list.isLoadingMore
        else {
            return
        }
        let revision = list.revision
        lists[scope]?.isLoadingMore = true
        defer { lists[scope]?.isLoadingMore = false }

        do {
            let pages = try await fetchPages(
                query: ArticleQuery(scope: scope, filter: list.filter),
                articles: list.merge.needsArticlePage
                    ? .page(cursor: list.merge.articles.cursor)
                    : .skip,
                savedPages: list.merge.needsSavedPagePage
                    ? .page(cursor: list.merge.savedPages.cursor)
                    : .skip
            )
            guard var queue = lists[scope]?.merge, lists[scope]?.revision == revision else {
                return
            }
            absorb(pages, into: &queue)
            lists[scope]?.merge = queue
        } catch is CancellationError {
            return
        } catch {
            mutationError = error.localizedDescription
        }
    }

    func loadSubscriptions() async {
        subscriptionState = subscriptions.isEmpty ? .loading : subscriptionState
        do {
            subscriptions = try await apiClient.fetchSubscriptions(connection)
            subscriptionState = .loaded
        } catch is CancellationError {
            return
        } catch {
            subscriptionState = .failed(error.localizedDescription)
        }
    }

    /// Fetches the first page of every stream this list draws from and replaces its contents.
    /// The previous rows stay on screen while it runs, because a reader mid-scan should never
    /// be shown a skeleton — the new order is swapped in whole, only once it has arrived.
    ///
    /// Both halves of the unified queue have to land for the load to have succeeded: a queue
    /// missing one of its two streams is not a shorter queue, it is a wrong one.
    private func load(scope: ArticleListScope) async {
        guard let list = lists[scope] else { return }
        let filter = list.filter
        let revision = list.revision + 1
        let unified = Self.mergesSavedPages(scope: scope, filter: filter)
        lists[scope]?.revision = revision
        if list.merge.entryIDs.isEmpty {
            lists[scope]?.loadState = .loading
        }

        do {
            let pages = try await fetchPages(
                query: ArticleQuery(scope: scope, filter: filter),
                articles: .page(cursor: nil),
                savedPages: unified ? .page(cursor: nil) : .skip
            )
            guard lists[scope]?.revision == revision else { return }
            var queue = ReaderEntryMerge(includesSavedPages: unified)
            absorb(pages, into: &queue)
            lists[scope]?.merge = queue
            lists[scope]?.loadState = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard lists[scope]?.revision == revision else { return }
            lists[scope]?.loadState = .failed(error.localizedDescription)
        }
    }

    private func absorb(_ pages: FetchedPages, into queue: inout ReaderEntryMerge) {
        if let page = pages.articles {
            remember(page.data)
            queue.acceptArticles(page.data.map(Self.item(for:)), nextCursor: page.pagination.nextCursor)
        }
        if let page = pages.savedPages {
            remember(savedPages: page.data)
            queue.acceptSavedPages(page.data.map(Self.item(for:)), nextCursor: page.pagination.nextCursor)
        }
    }

    /// Which page of a stream a load wants, if any. "Nothing from this stream" cannot be
    /// spelled as a nil cursor, because a nil cursor is how you ask for the first page.
    private enum StreamRequest: Sendable {
        case skip
        case page(cursor: String?)
    }

    private struct FetchedPages: Sendable {
        var articles: APIArticlePage?
        var savedPages: APIPage<APISavedPage>?
    }

    /// The two streams go out together. `nonisolated` so they genuinely overlap instead of
    /// taking turns on the main actor.
    private nonisolated func fetchPages(
        query: ArticleQuery,
        articles: StreamRequest,
        savedPages: StreamRequest
    ) async throws -> FetchedPages {
        async let articleStream = articlePage(query: query, request: articles)
        async let savedPageStream = savedPagePage(request: savedPages)
        return try await FetchedPages(articles: articleStream, savedPages: savedPageStream)
    }

    private nonisolated func articlePage(
        query: ArticleQuery,
        request: StreamRequest
    ) async throws -> APIArticlePage? {
        guard case let .page(cursor) = request else { return nil }
        return try await apiClient.fetchArticles(connection, query, cursor)
    }

    private nonisolated func savedPagePage(
        request: StreamRequest
    ) async throws -> APIPage<APISavedPage>? {
        guard case let .page(cursor) = request else { return nil }
        return try await apiClient.fetchSavedPages(connection, cursor)
    }
}
