import SwiftUI

struct ArticleDetailView: View {
    let articleID: String

    @Environment(ReaderStore.self) private var store
    @Environment(ReadingSettings.self) private var reading
    @Environment(\.scenePhase) private var scenePhase
    /// Bumped only when the reader taps a toolbar verb, never when opening an article
    /// auto-marks it read — punctuation belongs to deliberate actions.
    @State private var triageTapCount = 0
    @State private var tracker = ReadingProgressTracker()

    private var entryID: ReaderEntryID { .article(articleID) }

    var body: some View {
        Group {
            if let article = store.article(id: articleID) {
                readerView(for: article)
            } else {
                ContentUnavailableView {
                    Label("Article unavailable", systemImage: "doc.questionmark")
                } description: {
                    Text("This article is no longer in the list you opened it from.")
                        .foregroundStyle(BrandSecondaryInk.color)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .currentfoldCanvas()
    }

    private func readerView(for article: APIArticle) -> some View {
        VStack(spacing: 0) {
            ArticleHeader(article: article)
            if let html = article.content.html, !html.isEmpty {
                // The rule that used to separate the header from the body *is* the progress
                // line now — see ``ReadingProgressBar``. Nothing without a scrollable body
                // gets one, because there would be nothing for it to measure.
                ReadingProgressBar(progress: tracker.progress)
                ArticleHTMLView(
                    html: html,
                    baseURL: article.canonicalUrl ?? article.url,
                    typography: reading.typography,
                    resumeAt: store.resumePosition(for: entryID),
                    onProgress: { tracker.report($0, for: entryID, to: store) }
                )
            } else {
                Divider()
                missingCopy(article)
            }
        }
        .navigationTitle(article.feed.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { ReadingTypographyButton() }
            ToolbarItem(placement: .topBarTrailing) { readToggle(article) }
            ToolbarItem(placement: .topBarTrailing) { overflowMenu(article) }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: triageTapCount)
        .task(id: article.id) {
            tracker.begin(at: store.resumePosition(for: entryID))
            store.beginReading(entryID)
            await store.setRead(articleID: article.id, read: true)
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase != .active else { return }
            tracker.flush(to: store)
        }
        .onDisappear { tracker.flush(to: store) }
    }

    /// Read state keeps the one always-visible slot: it is the verb this screen changes by
    /// merely existing, so its current value has to be legible without opening a menu. Star,
    /// read later, share, and open original share an overflow menu rather than crowding a bar
    /// that already carries a back button and the feed name. **Aa** sits to their left, so the
    /// control changed constantly stays nearest the thumb and the one changed once does not.
    private func readToggle(_ article: APIArticle) -> some View {
        Button {
            commit { await store.setRead(articleID: article.id, read: !article.state.read) }
        } label: {
            Label(
                ReadStateIcon.toggleTitle(isRead: article.state.read),
                systemImage: ReadStateIcon.toggle(isRead: article.state.read)
            )
        }
    }

    private func overflowMenu(_ article: APIArticle) -> some View {
        Menu {
            Button {
                commit {
                    await store.setStarred(articleID: article.id, starred: !article.state.starred)
                }
            } label: {
                Label(
                    StarIcon.toggleTitle(isStarred: article.state.starred),
                    systemImage: StarIcon.toggle(isStarred: article.state.starred)
                )
            }

            Button {
                commit {
                    await store.setReadLater(
                        articleID: article.id,
                        readLater: !article.state.readLater
                    )
                }
            } label: {
                Label(
                    ReadLaterIcon.toggleTitle(isSaved: article.state.readLater),
                    systemImage: ReadLaterIcon.toggle(isSaved: article.state.readLater)
                )
            }

            if let url = article.canonicalUrl ?? article.url {
                ShareLink(item: url, subject: Text(article.title))
                Link(destination: url) {
                    Label("Open Original", systemImage: "safari")
                }
            }
        } label: {
            Label("More", systemImage: "ellipsis.circle")
        }
    }

    private func missingCopy(_ article: APIArticle) -> some View {
        ContentUnavailableView {
            Label("No readable copy", systemImage: "doc.text.magnifyingglass")
        } description: {
            Text("This article arrived without its full text. The original page has the rest.")
                .foregroundStyle(BrandSecondaryInk.color)
        } actions: {
            if let url = article.canonicalUrl ?? article.url {
                Link("Open Original", destination: url)
                    .buttonStyle(.primaryAction)
            }
        }
    }

    private func commit(_ mutation: @escaping @MainActor () async -> Void) {
        triageTapCount += 1
        Task { await mutation() }
    }
}

private struct ArticleHeader: View {
    let article: APIArticle

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(article.title)
                .font(.system(.title, design: .serif, weight: .semibold))
                .accessibilityAddTraits(.isHeader)

            // One `Text`, not an `HStack` of them: separate views each get their own share of
            // the width, so at an accessibility size the line became four hyphenated columns
            // ("Exam-ple Source · Exam-ple Author · 4 min read") instead of a wrapping
            // sentence. Joining first also means VoiceOver reads one meta line rather than
            // stopping on a lone middle dot.
            Text(metaLine)
                .font(.subheadline)
                .foregroundStyle(BrandSecondaryInk.color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }

    private var metaLine: String {
        [article.feed.title, article.author, article.readingTimeLabel]
            .compactMap(\.self)
            .joined(separator: " · ")
    }
}

#Preview("Article") {
    NavigationStack {
        ArticleDetailView(articleID: APIArticle.fixture.id)
    }
    .environment(PreviewFixtures.readerStore(articles: [.fixture]))
    .environment(ReadingSettings.ephemeral())
}

#Preview("Starred and saved") {
    NavigationStack {
        ArticleDetailView(articleID: APIArticle.starredFixture.id)
    }
    .environment(PreviewFixtures.readerStore(articles: [.starredFixture]))
    .environment(ReadingSettings.ephemeral())
}

#Preview("Serif, wide, large") {
    NavigationStack {
        ArticleDetailView(articleID: APIArticle.fixture.id)
    }
    .environment(PreviewFixtures.readerStore(articles: [.fixture]))
    .environment(
        ReadingSettings.ephemeral(
            ReadingTypography(size: .large, font: .serif, width: .wide)
        )
    )
}
