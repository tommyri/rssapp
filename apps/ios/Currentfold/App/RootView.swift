import SwiftUI

struct RootView: View {
    let apiClient: CurrentfoldAPIClient
    @Environment(SessionStore.self) private var session

    var body: some View {
        Group {
            if session.isRestoring {
                LaunchView()
            } else if let connection = session.connection,
                      let account = session.account {
                ReaderShell(
                    connection: connection,
                    account: account,
                    apiClient: apiClient
                )
                .id(connection.baseURL)
            } else if session.connection != nil {
                ConnectionUnavailableView(
                    isRetrying: session.isConnecting,
                    message: session.authErrorMessage,
                    retry: { await session.retry() },
                    signOut: { await session.signOut() }
                )
            } else {
                AuthenticationView()
            }
        }
        .task { await session.restore() }
        .onReceive(NotificationCenter.default.publisher(for: .currentfoldSessionExpired)) { _ in
            Task { await session.expireSession() }
        }
        .onOpenURL { url in
            if !GoogleNativeSignIn.handle(url) {
                session.handleIncomingURL(url)
            }
        }
        .sheet(item: authLinkBinding) { link in
            switch link {
            case let .verification(token):
                VerificationLinkView(token: token)
            case let .passwordReset(token):
                PasswordResetLinkView(token: token)
            case let .invitation(token):
                NavigationStack {
                    RegistrationView(prefilledEmail: "", inviteToken: token)
                }
            }
        }
    }

    private var authLinkBinding: Binding<PendingAuthLink?> {
        Binding(
            get: { session.pendingAuthLink },
            set: { if $0 == nil { session.dismissAuthLink() } }
        )
    }
}

private struct LaunchView: View {
    var body: some View {
        VStack(spacing: 24) {
            BrandHeader()
            ProgressView("Opening your reader…")
        }
        .padding(32)
    }
}
