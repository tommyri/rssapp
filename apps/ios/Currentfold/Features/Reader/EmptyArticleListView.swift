import SwiftUI

/// An empty list means something different in every view, and the honest answer is different
/// too: caught up is an achievement, an empty Starred view is an unused feature that needs
/// explaining, and an account with no sources cannot be fixed by refreshing.
struct EmptyArticleListView: View {
    let destination: ArticleListDestination
    let filter: ArticleFilter

    @Environment(ReaderStore.self) private var store
    @State private var isAddingSource = false

    var body: some View {
        Group {
            if isAccountWithoutSources {
                noSources
            } else {
                switch filter {
                case .unread: caughtUp
                case .all: nothingPublished
                case .starred: nothingStarred
                case .readLater: readLaterEmpty
                }
            }
        }
        .sheet(isPresented: $isAddingSource) {
            // The Library cannot push a source's list — only Sources declares that
            // destination — so the useful landing here is the Library itself, now that it has
            // something in it.
            AddFeedView(store: store) { _ in
                Task { await store.reload(scope: destination.scope) }
            }
        }
    }

    private var isAccountWithoutSources: Bool {
        destination.scope == .library
            && store.subscriptionState == .loaded
            && store.subscriptions.isEmpty
    }

    private var noSources: some View {
        ContentUnavailableView {
            Label("No sources yet", systemImage: "dot.radiowaves.left.and.right")
        } description: {
            Text(
                """
                Paste a site or a feed address and Currentfold finds the feed. Its \
                articles land here.
                """
            )
            .foregroundStyle(BrandSecondaryInk.color)
        } actions: {
            Button("Add a Source") { isAddingSource = true }
                .buttonStyle(.primaryAction)
            Button("Refresh") { Task { await store.reload(scope: destination.scope) } }
        }
    }

    private var caughtUp: some View {
        ContentUnavailableView {
            Label("You’re all caught up", systemImage: "checkmark.circle")
        } description: {
            Text("Nothing unread \(inScope). New articles appear as your sources publish them.")
                .foregroundStyle(BrandSecondaryInk.color)
        } actions: {
            Button("Show All Articles") { show(.all) }
                .buttonStyle(.primaryAction)
        }
    }

    private var nothingPublished: some View {
        ContentUnavailableView {
            Label("Nothing to read yet", systemImage: "text.page")
        } description: {
            Text("No articles \(inScope) yet. They appear here as they are published.")
                .foregroundStyle(BrandSecondaryInk.color)
        } actions: {
            Button("Check for New Articles") {
                Task { await store.reload(scope: destination.scope) }
            }
            .buttonStyle(.primaryAction)
        }
    }

    private var nothingStarred: some View {
        ContentUnavailableView {
            Label("Nothing starred", systemImage: StarIcon.unstarred)
        } description: {
            Text(
                """
                Starring keeps an article you’ll want to find again \(inScope). \
                Swipe a row and tap Star, or star it while reading.
                """
            )
            .foregroundStyle(BrandSecondaryInk.color)
        } actions: {
            Button("Show Unread") { show(.unread) }
                .buttonStyle(.primaryAction)
        }
    }

    /// The one empty state that teaches two things, because Read Later has two doors: a swipe
    /// on a row you already follow, and the share sheet from anywhere else on the phone. The
    /// second only exists at the Library, where saved pages land — a per-source queue holds
    /// articles from that source and nothing else, so promising it there would be a lie.
    private var readLaterEmpty: some View {
        ContentUnavailableView {
            Label("Read Later is empty", systemImage: ReadLaterIcon.unsaved)
        } description: {
            Text(
                mergesSavedPages
                    ? """
                    Read Later is the queue for “I’ll get to this” — articles and pages saved \
                    from anywhere. Swipe a row to the left to put it here, or share a link to \
                    Currentfold from any app.
                    """
                    : """
                    Read Later is the queue for “I’ll get to this.” \
                    Swipe a row \(inScope) to the left to put it here.
                    """
            )
            .foregroundStyle(BrandSecondaryInk.color)
        } actions: {
            Button("Show Unread") { show(.unread) }
                .buttonStyle(.primaryAction)
        }
    }

    private var mergesSavedPages: Bool {
        ReaderStore.mergesSavedPages(scope: destination.scope, filter: filter)
    }

    /// "in Library" reads as boilerplate; a source or folder name does not.
    private var inScope: String {
        destination.scope == .library ? "here" : "in \(destination.title)"
    }

    private func show(_ filter: ArticleFilter) {
        Task { await store.setFilter(filter, for: destination.scope) }
    }
}

#Preview("Caught up") {
    NavigationStack {
        EmptyArticleListView(destination: .library, filter: .unread)
            .environment(PreviewFixtures.readerStore(subscriptions: [.fixture]))
    }
}

#Preview("Nothing starred") {
    NavigationStack {
        EmptyArticleListView(
            destination: ArticleListDestination(scope: .subscription(id: "7"), title: "Example Source"),
            filter: .starred
        )
        .environment(PreviewFixtures.readerStore(subscriptions: [.fixture]))
    }
}

#Preview("No sources yet") {
    NavigationStack {
        EmptyArticleListView(destination: .library, filter: .unread)
            .environment(PreviewFixtures.readerStore())
    }
}
