import SwiftUI

struct ArticleDetailView: View {
    let articleID: String
    @Environment(ReaderStore.self) private var store

    var body: some View {
        Group {
            if let article = store.article(id: articleID) {
                VStack(spacing: 0) {
                    ArticleHeader(article: article)
                    Divider()
                    if let html = article.content.html, !html.isEmpty {
                        ArticleHTMLView(html: html, baseURL: article.canonicalUrl ?? article.url)
                    } else {
                        ContentUnavailableView(
                            "No readable copy",
                            systemImage: "doc.text.magnifyingglass",
                            description: Text("Open the original article to continue reading.")
                        )
                    }
                }
                .navigationTitle(article.feed.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if let url = article.canonicalUrl ?? article.url {
                        ToolbarItem(placement: .topBarTrailing) {
                            Link(destination: url) {
                                Label("Open Original", systemImage: "safari")
                            }
                        }
                    }
                }
                .task(id: article.id) {
                    await store.setRead(articleID: article.id, read: true)
                }
            } else {
                ContentUnavailableView("Article unavailable", systemImage: "doc.questionmark")
            }
        }
    }
}

private struct ArticleHeader: View {
    let article: APIArticle

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(article.title)
                .font(.system(.title, design: .serif, weight: .semibold))
            HStack(spacing: 5) {
                Text(article.feed.title)
                if let author = article.author {
                    Text("·")
                    Text(author)
                }
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }
}
