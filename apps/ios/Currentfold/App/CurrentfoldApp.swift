import SwiftUI

@main
struct CurrentfoldApp: App {
    private let apiClient: CurrentfoldAPIClient
    @State private var sessionStore: SessionStore
    @State private var theme = CurrentfoldTheme()

    init() {
        let credentialStore = KeychainCredentialStore()
        let apiClient = CurrentfoldAPIClient.live(credentialStore: credentialStore)
        self.apiClient = apiClient
        _sessionStore = State(
            initialValue: SessionStore(
                apiClient: apiClient,
                credentialStore: credentialStore
            )
        )
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
