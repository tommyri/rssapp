import SwiftUI

/// Settings, and the scope of every setting in it.
///
/// The web's settings are grouped by whether they follow the account or stay on the device,
/// and each group says which. This keeps that: **Reading** is this device's, **Account** is the
/// account's, and both footers say so out loud rather than leaving a reader to discover on
/// their second phone that text size did not come with them.
struct SettingsView: View {
    let account: APIAccount

    @Environment(SessionStore.self) private var session
    @Environment(ReadingSettings.self) private var reading

    var body: some View {
        @Bindable var reading = reading

        List {
            Section {
                Picker("Text Size", selection: $reading.typography.size) {
                    ForEach(ReadingTextSize.allCases) { Text($0.title).tag($0) }
                }
                Picker("Font", selection: $reading.typography.font) {
                    ForEach(ReadingBodyFont.allCases) { Text($0.title).tag($0) }
                }
                Picker("Column Width", selection: $reading.typography.width) {
                    ForEach(ReadingColumnWidth.allCases) { Text($0.title).tag($0) }
                }
            } header: {
                Text("Reading")
            } footer: {
                Text(
                    """
                    This device. Text size adjusts the article on top of your system text \
                    size — it never replaces it. Also available as Aa while reading.
                    """
                )
                .foregroundStyle(BrandSecondaryInk.color)
            }
            .currentfoldRaisedRows()

            Section {
                // `LabeledContent(_:value:)` draws its value in the platform's secondary
                // label; here the value *is* the content, so it takes the muted ink that
                // clears AA on this canvas.
                LabeledContent("Name") {
                    Text(account.displayName ?? "Not set")
                        .foregroundStyle(BrandSecondaryInk.color)
                }
                LabeledContent("Email") {
                    Text(account.email).foregroundStyle(BrandSecondaryInk.color)
                }
            } header: {
                Text("Account")
            } footer: {
                Text("Your account, on every device you sign in on.")
                    .foregroundStyle(BrandSecondaryInk.color)
            }
            .currentfoldRaisedRows()

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
                .foregroundStyle(BrandSecondaryInk.color)
            }
            .currentfoldRaisedRows()
        }
        .currentfoldCanvas()
        .navigationTitle("Settings")
    }
}

#Preview("Settings") {
    NavigationStack {
        SettingsView(account: .fixture)
    }
    .environment(ReadingSettings.ephemeral())
    .environment(PreviewFixtures.sessionStore)
}
