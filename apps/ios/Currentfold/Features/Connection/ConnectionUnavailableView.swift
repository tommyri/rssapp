import SwiftUI

struct ConnectionUnavailableView: View {
    let serverURL: URL
    let isRetrying: Bool
    let message: String?
    let retry: @MainActor () async -> Void
    let forget: @MainActor () async -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Couldn’t reach Currentfold", systemImage: "network.slash")
        } description: {
            Text(message ?? "Check the server and try again.")
            Text(serverURL.absoluteString)
                .font(.caption.monospaced())
        } actions: {
            Button("Try Again") {
                Task { await retry() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isRetrying)

            Button("Use Another Server") {
                Task { await forget() }
            }
            .buttonStyle(.bordered)
        }
    }
}
