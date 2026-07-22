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

            Section {
                Button("Sign Out", role: .destructive) {
                    Task { await session.signOut() }
                }
            } footer: {
                Text(
                    """
                    This securely removes this device session. It does not delete your account.
                    """
                )
            }
        }
        .navigationTitle("Settings")
    }
}
