import SwiftUI

private enum AppTab: Hashable {
    case library
    case sources
    case settings
}

struct ReaderShell: View {
    let account: APIAccount
    @State private var selectedTab: AppTab = .library
    @State private var readerStore: ReaderStore
    @Environment(CurrentfoldTheme.self) private var theme

    init(
        connection: CurrentfoldConnection,
        account: APIAccount,
        apiClient: CurrentfoldAPIClient
    ) {
        self.account = account
        _readerStore = State(
            initialValue: ReaderStore(apiClient: apiClient, connection: connection)
        )
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                LibraryView()
            }
            .tabItem { Label("Library", systemImage: "text.page") }
            .tag(AppTab.library)

            NavigationStack {
                SourcesView()
            }
            .tabItem { Label("Sources", systemImage: "dot.radiowaves.left.and.right") }
            .tag(AppTab.sources)

            NavigationStack {
                SettingsView(account: account)
            }
            .tabItem { Label("Settings", systemImage: "gearshape") }
            .tag(AppTab.settings)
        }
        .environment(readerStore)
        .tint(theme.accent)
        .task { await readerStore.bootstrap() }
    }
}
