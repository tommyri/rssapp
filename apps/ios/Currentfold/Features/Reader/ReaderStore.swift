import Foundation
import Observation

enum ReaderLoadState: Equatable {
    case idle
    case loading
    case loaded
    case failed(String)
}

@MainActor
@Observable
final class ReaderStore {
    private(set) var articles: [APIArticle]
    private(set) var subscriptions: [APISubscription]
    private(set) var articleState: ReaderLoadState
    private(set) var subscriptionState: ReaderLoadState
    private(set) var isLoadingMore = false
    private(set) var mutationError: String?

    private let apiClient: CurrentfoldAPIClient
    private let connection: CurrentfoldConnection
    private var nextCursor: String?

    init(
        apiClient: CurrentfoldAPIClient,
        connection: CurrentfoldConnection,
        articles: [APIArticle] = [],
        subscriptions: [APISubscription] = [],
        articleState: ReaderLoadState = .idle,
        subscriptionState: ReaderLoadState = .idle
    ) {
        self.apiClient = apiClient
        self.connection = connection
        self.articles = articles
        self.subscriptions = subscriptions
        self.articleState = articleState
        self.subscriptionState = subscriptionState
    }

    func bootstrap() async {
        guard articleState == .idle, subscriptionState == .idle else { return }
        await loadArticles()
        await loadSubscriptions()
    }

    func loadArticles() async {
        articleState = articles.isEmpty ? .loading : articleState
        do {
            let page = try await apiClient.fetchArticles(connection, nil)
            articles = page.data
            nextCursor = page.pagination.nextCursor
            articleState = .loaded
        } catch is CancellationError {
            return
        } catch {
            articleState = .failed(error.localizedDescription)
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

    func loadMoreIfNeeded(currentArticleID: String) async {
        guard currentArticleID == articles.last?.id,
              let cursor = nextCursor,
              !isLoadingMore
        else {
            return
        }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await apiClient.fetchArticles(connection, cursor)
            let existingIDs = Set(articles.map(\.id))
            articles.append(contentsOf: page.data.filter { !existingIDs.contains($0.id) })
            nextCursor = page.pagination.nextCursor
        } catch is CancellationError {
            return
        } catch {
            mutationError = error.localizedDescription
        }
    }

    func article(id: String) -> APIArticle? {
        articles.first { $0.id == id }
    }

    func setRead(articleID: String, read: Bool) async {
        guard let index = articles.firstIndex(where: { $0.id == articleID }),
              articles[index].state.read != read
        else {
            return
        }

        let previous = articles[index].state.read
        articles[index].state.read = read
        mutationError = nil
        do {
            try await apiClient.updateReadState(connection, [articleID], read)
        } catch is CancellationError {
            articles[index].state.read = previous
        } catch {
            articles[index].state.read = previous
            mutationError = error.localizedDescription
        }
    }

    func clearMutationError() {
        mutationError = nil
    }
}
