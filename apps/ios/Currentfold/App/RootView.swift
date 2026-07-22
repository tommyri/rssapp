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
            } else if let connection = session.connection {
                ConnectionUnavailableView(
                    serverURL: connection.baseURL,
                    isRetrying: session.isConnecting,
                    message: session.errorMessage,
                    retry: { await session.retry() },
                    forget: { await session.disconnect() }
                )
            } else {
                ConnectionView(
                    isConnecting: session.isConnecting,
                    errorMessage: session.errorMessage,
                    connect: { address, token in
                        await session.connect(serverAddress: address, token: token)
                    }
                )
            }
        }
        .task { await session.restore() }
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
