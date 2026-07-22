import SwiftUI

@main
struct CurrentfoldApp: App {
    private let apiClient: CurrentfoldAPIClient
    @State private var sessionStore: SessionStore
    @State private var theme = CurrentfoldTheme()

    init() {
        let apiClient = CurrentfoldAPIClient.live()
        self.apiClient = apiClient
        _sessionStore = State(initialValue: SessionStore(apiClient: apiClient))
    }

    var body: some Scene {
        WindowGroup {
            RootView(apiClient: apiClient)
                .environment(sessionStore)
                .environment(theme)
                .tint(theme.accent)
        }
    }
}
