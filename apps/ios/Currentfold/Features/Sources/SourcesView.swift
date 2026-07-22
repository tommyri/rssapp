import SwiftUI

struct SourcesView: View {
    @Environment(ReaderStore.self) private var store

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
                    Text(message)
                } actions: {
                    Button("Try Again") { Task { await store.loadSubscriptions() } }
                        .buttonStyle(.borderedProminent)
                }
            case .loaded where store.subscriptions.isEmpty:
                ContentUnavailableView(
                    "No sources yet",
                    systemImage: "dot.radiowaves.left.and.right",
                    description: Text("Add your first source in the web app for now.")
                )
            default:
                List {
                    ForEach(groupedSubscriptions, id: \.name) { group in
                        Section(group.name) {
                            ForEach(group.subscriptions) { subscription in
                                SourceRow(subscription: subscription)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .refreshable { await store.loadSubscriptions() }
            }
        }
        .navigationTitle("Sources")
    }

    private var groupedSubscriptions: [(name: String, subscriptions: [APISubscription])] {
        Dictionary(grouping: store.subscriptions) { $0.folder?.name ?? "Unfiled" }
            .map { (name: $0.key, subscriptions: $0.value) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

private struct SourceRow: View {
    let subscription: APISubscription

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(subscription.title)
                if subscription.paused {
                    Text("Paused")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if subscription.unreadCount > 0 {
                Text(subscription.unreadCount, format: .number)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("\(subscription.unreadCount) unread")
            }
        }
    }
}

#Preview("Sources") {
    NavigationStack { SourcesView() }
        .environment(
            PreviewFixtures.readerStore(subscriptions: [.fixture])
        )
}
