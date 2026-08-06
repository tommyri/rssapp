import SwiftUI

@main
struct CurrentfoldApp: App {
    private let apiClient: CurrentfoldAPIClient
    @State private var sessionStore: SessionStore
    @State private var theme = CurrentfoldTheme()
    /// Device-scoped reading preferences, read once at launch and written on every change.
    @State private var reading = ReadingSettings()

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
                .environment(reading)
                .tint(theme.accentInk)
        }
    }
}
