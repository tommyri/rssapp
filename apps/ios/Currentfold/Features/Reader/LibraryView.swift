import SwiftUI

struct LibraryView: View {
    @Environment(ReaderStore.self) private var store

    var body: some View {
        Group {
            switch store.articleState {
            case .idle:
                ProgressView("Loading your reading…")
            case .loading where store.articles.isEmpty:
                ProgressView("Loading your reading…")
            case let .failed(message) where store.articles.isEmpty:
                ContentUnavailableView {
                    Label("Couldn’t load articles", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try Again") { Task { await store.loadArticles() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded where store.articles.isEmpty:
                ContentUnavailableView(
                    "Nothing to read yet",
                    systemImage: "text.page",
                    description: Text("New articles from your sources will appear here.")
                )
            default:
                articleList
            }
        }
        .navigationTitle("Library")
        .alert(
            "Couldn’t update article",
            isPresented: Binding(
                get: { store.mutationError != nil },
                set: { if !$0 { store.clearMutationError() } }
            )
        ) {
            Button("OK", role: .cancel) { store.clearMutationError() }
        } message: {
            Text(store.mutationError ?? "Try again.")
        }
    }

    private var articleList: some View {
        List {
            ForEach(store.articles) { article in
                NavigationLink {
                    ArticleDetailView(articleID: article.id)
                } label: {
                    ArticleRow(article: article)
                }
                .swipeActions(edge: .leading) {
                    Button(article.state.read ? "Unread" : "Read") {
                        Task {
                            await store.setRead(
                                articleID: article.id,
                                read: !article.state.read
                            )
                        }
                    }
                    .tint(article.state.read ? .blue : .green)
                }
                .task { await store.loadMoreIfNeeded(currentArticleID: article.id) }
            }

            if store.isLoadingMore {
                HStack {
                    Spacer()
                    ProgressView("Loading older articles…")
                    Spacer()
                }
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .refreshable { await store.loadArticles() }
    }
}

private struct ArticleRow: View {
    let article: APIArticle

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(article.state.read ? Color.clear : Color.accentColor)
                .frame(width: 7, height: 7)
                .padding(.top, 8)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                Text(article.title)
                    .font(.headline)
                    .fontWeight(article.state.read ? .regular : .semibold)
                    .foregroundStyle(.primary)
                    .lineLimit(3)

                HStack(spacing: 5) {
                    Text(article.feed.title)
                    if let displayDate = article.displayDate {
                        Text("·")
                        Text(displayDate)
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .accessibilityLabel(
            "\(article.state.read ? "Read" : "Unread"), \(article.title), \(article.feed.title)"
        )
    }
}

#Preview("Loaded library") {
    NavigationStack { LibraryView() }
        .environment(PreviewFixtures.readerStore(articles: [.fixture]))
}

#Preview("Empty library") {
    NavigationStack { LibraryView() }
        .environment(PreviewFixtures.readerStore())
}
