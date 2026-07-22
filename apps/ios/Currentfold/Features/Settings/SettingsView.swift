import SwiftUI

struct SettingsView: View {
    let account: APIAccount
    @Environment(SessionStore.self) private var session

    var body: some View {
        List {
            Section("Account") {
                LabeledContent("Name", value: account.displayName ?? "Not set")
                LabeledContent("Email", value: account.email)
            }

            if let serverURL = session.connection?.baseURL {
                Section("Server") {
                    Text(serverURL.absoluteString)
                        .font(.footnote.monospaced())
                        .textSelection(.enabled)
                }
            }

            Section {
                Button("Disconnect This Device", role: .destructive) {
                    Task { await session.disconnect() }
                }
            } footer: {
                Text(
                    """
                    This removes the app credential from this device. It does not delete \
                    the account or change your web sign-in.
                    """
                )
            }
        }
        .navigationTitle("Settings")
    }
}
