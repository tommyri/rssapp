import SwiftUI

/// A navigable article stream: the Library tab, one source, or one folder. The title travels
/// with the destination rather than being looked up, so a pushed list is named by whatever
/// row the reader tapped.
struct ArticleListDestination: Hashable {
    let scope: ArticleListScope
    let title: String

    static let library = ArticleListDestination(scope: .library, title: "Library")

    static func subscription(_ subscription: APISubscription) -> ArticleListDestination {
        ArticleListDestination(scope: .subscription(id: subscription.id), title: subscription.title)
    }

    static func folder(_ folder: APISubscription.Folder) -> ArticleListDestination {
        ArticleListDestination(scope: .folder(id: folder.id), title: folder.name)
    }

    /// Only a per-source list can drop the feed name from its rows; a folder mixes sources.
    var showsFeedName: Bool { scope.subscriptionID == nil }
}

/// One article list, shared by the Library tab and every pushed source or folder list, so the
/// row recipe and the triage verbs cannot drift between them.
struct ArticleListView: View {
    let destination: ArticleListDestination

    @Environment(ReaderStore.self) private var store
    /// Set once per view instance, which is what makes a fresh navigation a fresh visit while
    /// a push to an article — or a trip to another tab — leaves the session's rows in place.
    @State private var hasOpenedList = false
    /// Bumped on every deliberate triage commit (swipe, context menu) so the haptic
    /// punctuates the gesture, not the network round trip.
    @State private var triageCommitCount = 0
    @State private var sweepCount = 0
    @State private var pendingSweep: MarkAllReadSweep?
    @State private var sweepResult: String?

    var body: some View {
        Group {
            switch snapshot.loadState {
            case .idle:
                ProgressView("Loading your reading…")
            case .loading where snapshot.entries.isEmpty:
                ProgressView("Loading your reading…")
            case let .failed(message) where snapshot.entries.isEmpty:
                loadFailure(message)
            case .loaded where snapshot.entries.isEmpty:
                EmptyArticleListView(destination: destination, filter: snapshot.filter)
            default:
                articleList
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .currentfoldCanvas()
        .navigationTitle(destination.title)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { sweepMenu }
            ToolbarItem(placement: .topBarTrailing) { filterMenu }
        }
        .overlay(alignment: .bottom) {
            sweepReceipt.animation(.easeInOut(duration: 0.2), value: sweepResult)
        }
        .sensoryFeedback(.impact(weight: .light), trigger: triageCommitCount)
        .sensoryFeedback(.success, trigger: sweepCount)
        .confirmationDialog(
            Text(pendingSweep?.confirmationTitle(scope: destination.title) ?? ""),
            isPresented: Binding(
                get: { pendingSweep != nil },
                set: { if !$0 { pendingSweep = nil } }
            ),
            titleVisibility: .visible,
            presenting: pendingSweep
        ) { sweep in
            Button(sweep.commitTitle) { commit(sweep) }
            Button("Cancel", role: .cancel) { pendingSweep = nil }
        } message: { sweep in
            Text(sweep.explanation(scope: destination.title))
        }
        .alert(
            "Couldn’t update that",
            isPresented: Binding(
                get: { store.mutationError != nil },
                set: { if !$0 { store.clearMutationError() } }
            )
        ) {
            Button("OK", role: .cancel) { store.clearMutationError() }
        } message: {
            Text(store.mutationError ?? "Try again.")
        }
        .task {
            guard !hasOpenedList else { return }
            hasOpenedList = true
            await store.openList(scope: destination.scope)
        }
    }

    private var snapshot: ReaderListSnapshot {
        store.list(for: destination.scope)
    }
}

// MARK: - The list

private extension ArticleListView {
    var articleList: some View {
        List {
            ForEach(snapshot.entries) { entry in
                cell(for: entry)
                    .task {
                        await store.loadMoreIfNeeded(
                            scope: destination.scope,
                            currentEntryID: entry.id
                        )
                    }
            }
            .currentfoldCanvasRows()

            if snapshot.isLoadingMore {
                HStack {
                    Spacer()
                    ProgressView("Loading older articles…")
                    Spacer()
                }
                .listRowSeparator(.hidden)
                .currentfoldCanvasRows()
            }
        }
        .listStyle(.plain)
        .refreshable { await store.reload(scope: destination.scope) }
    }

    /// One row, whichever half of the queue it came from. The two cells are siblings rather
    /// than one clever generic cell: an article and a saved page carry different verbs, and
    /// pretending otherwise would put a star on something that cannot be starred.
    @ViewBuilder
    func cell(for entry: ReaderEntry) -> some View {
        switch entry {
        case let .article(article):
            articleCell(article)
        case let .savedPage(savedPage):
            savedPageCell(savedPage)
        }
    }

    func articleCell(_ article: APIArticle) -> some View {
        NavigationLink {
            ArticleDetailView(articleID: article.id)
        } label: {
            ArticleRow(article: article, showsFeedName: destination.showsFeedName)
        }
        .swipeActions(edge: .leading) {
            readAction(article).tint(ReadStateIcon.tint)
        }
        .swipeActions(edge: .trailing) {
            readLaterAction(article).tint(ReadLaterIcon.tint)
            starAction(article).tint(StarIcon.tint)
        }
        .contextMenu { rowMenu(article) }
    }

    func savedPageCell(_ entry: SavedPageEntry) -> some View {
        SavedPageCell(entry: entry, commit: commitTriage)
    }

    func loadFailure(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Couldn’t load articles", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again") { Task { await store.reload(scope: destination.scope) } }
                .buttonStyle(.primaryAction)
        }
    }
}

// MARK: - Triage verbs

private extension ArticleListView {
    /// Leading is read/unread in both directions. Unlike the web — where an unread row has no
    /// read swipe — a swipe here is already the deliberate action the read model asks for.
    ///
    /// The verbs are untinted so the same button can be a swipe reveal, where color is the cue,
    /// or a context-menu item, where a colored row would be noise. The swipe applies the tint.
    func readAction(_ article: APIArticle) -> some View {
        Button {
            commitTriage { await store.setRead(articleID: article.id, read: !article.state.read) }
        } label: {
            Label(
                ReadStateIcon.toggleShortTitle(isRead: article.state.read),
                systemImage: ReadStateIcon.toggle(isRead: article.state.read)
            )
        }
    }

    /// Listed first on the trailing edge, so a full swipe left toggles read later — the same
    /// gesture the mobile web ships.
    func readLaterAction(_ article: APIArticle) -> some View {
        Button {
            commitTriage {
                await store.setReadLater(articleID: article.id, readLater: !article.state.readLater)
            }
        } label: {
            Label(
                ReadLaterIcon.toggleShortTitle(isSaved: article.state.readLater),
                systemImage: ReadLaterIcon.toggle(isSaved: article.state.readLater)
            )
        }
    }

    func starAction(_ article: APIArticle) -> some View {
        Button {
            commitTriage {
                await store.setStarred(articleID: article.id, starred: !article.state.starred)
            }
        } label: {
            Label(
                StarIcon.toggleTitle(isStarred: article.state.starred),
                systemImage: StarIcon.toggle(isStarred: article.state.starred)
            )
        }
    }

    /// The menu spells the read verb out ("Mark Read"), where the swipe abbreviates it, and adds
    /// read later's full "Remove from Read Later".
    @ViewBuilder
    func rowMenu(_ article: APIArticle) -> some View {
        Button {
            commitTriage { await store.setRead(articleID: article.id, read: !article.state.read) }
        } label: {
            Label(
                ReadStateIcon.toggleTitle(isRead: article.state.read),
                systemImage: ReadStateIcon.toggle(isRead: article.state.read)
            )
        }

        starAction(article)

        Button {
            commitTriage {
                await store.setReadLater(articleID: article.id, readLater: !article.state.readLater)
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
    }

    func commitTriage(_ mutation: @escaping @MainActor () async -> Void) {
        triageCommitCount += 1
        Task { await mutation() }
    }
}

// MARK: - Toolbar

private extension ArticleListView {
    /// A labelled menu rather than segmented chrome: the active view has to be legible without
    /// opening anything, and an inline `Picker` gives the checkmark selection for free.
    /// The active view's name *is* the control, because a toolbar renders a `Label` icon-only and
    /// an icon alone cannot say which of four views you are looking at.
    var filterMenu: some View {
        Menu(snapshot.filter.switcherTitle) {
            Picker("View", selection: filterSelection) {
                ForEach(ArticleFilter.allCases) { filter in
                    Label(filter.title, systemImage: filter.symbol).tag(filter)
                }
            }
            .pickerStyle(.inline)
        }
        .accessibilityLabel("View, \(snapshot.filter.title)")
    }

    var filterSelection: Binding<ArticleFilter> {
        Binding(
            get: { snapshot.filter },
            set: { filter in
                Task { await store.setFilter(filter, for: destination.scope) }
            }
        )
    }

    var sweepMenu: some View {
        Menu {
            ForEach(MarkAllReadSweep.allCases) { sweep in
                Button(sweep.menuTitle) { pendingSweep = sweep }
            }
        } label: {
            Label("Mark Read", systemImage: "checkmark.circle")
        }
    }

    /// The result, stated once and then gone. Loud enough to answer "did that do anything?",
    /// quiet enough that it is not a dialog.
    @ViewBuilder
    var sweepReceipt: some View {
        if let sweepResult {
            Text(sweepResult)
                .font(.footnote)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(.thinMaterial, in: Capsule())
                .padding(.bottom, 24)
                .transition(.opacity)
        }
    }

    func commit(_ sweep: MarkAllReadSweep) {
        pendingSweep = nil
        Task {
            guard let count = await store.markAllRead(
                scope: destination.scope,
                olderThan: sweep.cutoff()
            ) else {
                return
            }
            sweepCount += 1
            sweepResult = MarkAllReadSweep.receipt(markedCount: count)
            try? await Task.sleep(for: .seconds(2.5))
            sweepResult = nil
        }
    }
}

// MARK: - Vocabulary

extension ArticleFilter {
    var title: String {
        switch self {
        case .unread: "Unread"
        case .all: "All Articles"
        case .starred: "Starred"
        case .readLater: "Read Later"
        }
    }

    /// The switcher already sits under the list's own title, so "All Articles" would stutter.
    var switcherTitle: String {
        self == .all ? "All" : title
    }

    var symbol: String {
        switch self {
        case .unread: ReadStateIcon.unread
        case .all: "list.bullet"
        case .starred: StarIcon.starred
        case .readLater: ReadLaterIcon.saved
        }
    }
}
