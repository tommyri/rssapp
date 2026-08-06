import SwiftUI

struct ConnectionUnavailableView: View {
    let isRetrying: Bool
    let message: String?
    let retry: @MainActor () async -> Void
    let signOut: @MainActor () async -> Void

    var body: some View {
        ContentUnavailableView {
            Label("Currentfold Is Unavailable", systemImage: "network.slash")
        } description: {
            Text(message ?? "Check your internet connection and try again.")
                .foregroundStyle(BrandSecondaryInk.color)
        } actions: {
            Button("Try Again") {
                Task { await retry() }
            }
            .buttonStyle(.primaryAction)
            .disabled(isRetrying)

            Button("Sign Out") {
                Task { await signOut() }
            }
            .buttonStyle(.bordered)
        }
        .currentfoldCanvas()
    }
}
