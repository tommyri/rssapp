import SwiftUI

struct SourcesView: View {
    /// The Sources tab's navigation path, owned by the shell, so adding a source can land the
    /// reader on the source they just added rather than on a list they now have to find it in.
    @Binding var path: [ArticleListDestination]

    @Environment(ReaderStore.self) private var store
    @State private var isAddingSource = false

    var body: some View {
        Group {
            switch store.subscriptionState {
            case .idle:
                ProgressView("Loading sources…")
            case .loading where store.subscriptions.isEmpty:
                ProgressView("Loading sources…")
            case let .failed(message) where store.subscriptions.isEmpty:
                ContentUnavailableView {
                    Label("Couldn’t load sources", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message).foregroundStyle(BrandSecondaryInk.color)
                } actions: {
                    Button("Try Again") { Task { await store.loadSubscriptions() } }
                        .buttonStyle(.primaryAction)
                }
            case .loaded where store.subscriptions.isEmpty:
                ContentUnavailableView {
                    Label("No sources yet", systemImage: "dot.radiowaves.left.and.right")
                } description: {
                    Text(
                        """
                        Paste a site or a feed address and Currentfold finds the feed. \
                        Its articles land in your Library.
                        """
                    )
                    .foregroundStyle(BrandSecondaryInk.color)
                } actions: {
                    Button("Add a Source") { isAddingSource = true }
                        .buttonStyle(.primaryAction)
                    Button("Refresh") { Task { await store.loadSubscriptions() } }
                }
            default:
                sourceList
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .currentfoldCanvas()
        .navigationTitle("Sources")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { isAddingSource = true } label: {
                    Label("Add a Source", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $isAddingSource) {
            AddFeedView(store: store) { subscription in
                path.append(.subscription(subscription))
            }
        }
        .navigationDestination(for: ArticleListDestination.self) { destination in
            ArticleListView(destination: destination)
        }
    }

    private var sourceList: some View {
        List {
            ForEach(groups) { group in
                Section(group.name) {
                    if let folder = group.folder {
                        FolderRow(folder: folder, unreadCount: group.unreadCount)
                    }
                    ForEach(group.subscriptions) { subscription in
                        SourceRow(subscription: subscription)
                    }
                }
                .currentfoldRaisedRows()
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await store.loadSubscriptions() }
    }

    /// Folders alphabetically, then the unfiled sources — "Unfiled" is not a folder and reads
    /// wrong sorted among them.
    private var groups: [SourceGroup] {
        Dictionary(grouping: store.subscriptions) { $0.folder?.id }
            .map { SourceGroup(folder: $0.value.first?.folder, subscriptions: $0.value) }
            .sorted { left, right in
                guard let leftName = left.folder?.name else { return false }
                guard let rightName = right.folder?.name else { return true }
                return leftName.localizedCaseInsensitiveCompare(rightName) == .orderedAscending
            }
    }
}

private struct SourceGroup: Identifiable {
    let folder: APISubscription.Folder?
    let subscriptions: [APISubscription]

    var id: String { folder?.id ?? "" }
    var name: String { folder?.name ?? "Unfiled" }
    var unreadCount: Int { subscriptions.reduce(0) { $0 + $1.unreadCount } }
}

/// A real row rather than a tappable section header. Headers in iOS are labels — they carry no
/// chevron, no highlight, and no obvious hit target — so a folder gets the same affordance as
/// the sources beneath it, in Mail's "All Inboxes" shape.
private struct FolderRow: View {
    let folder: APISubscription.Folder
    let unreadCount: Int

    var body: some View {
        NavigationLink(value: ArticleListDestination.folder(folder)) {
            HStack {
                Label("All in \(folder.name)", systemImage: "folder")
                Spacer()
                UnreadCountText(count: unreadCount)
            }
        }
    }
}

private struct SourceRow: View {
    let subscription: APISubscription

    var body: some View {
        NavigationLink(value: ArticleListDestination.subscription(subscription)) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(subscription.title)
                    if subscription.paused {
                        Text("Paused")
                            .font(.caption)
                            .foregroundStyle(BrandSecondaryInk.color)
                    }
                }
                Spacer()
                UnreadCountText(count: subscription.unreadCount)
            }
        }
    }
}

private struct UnreadCountText: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text(UnreadCountFormat.label(count))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(BrandSecondaryInk.color)
                .accessibilityLabel(UnreadCountFormat.accessibilityLabel(count))
        }
    }
}

#Preview("Sources") {
    NavigationStack { SourcesView(path: .constant([])) }
        .environment(
            PreviewFixtures.readerStore(
                subscriptions: [.fixture, .busyFixture, .unfiledFixture]
            )
        )
}

#Preview("No sources yet") {
    NavigationStack { SourcesView(path: .constant([])) }
        .environment(PreviewFixtures.readerStore())
}
