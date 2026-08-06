import Foundation

/// The three things the extension needs from the app, built the app's way.
///
/// Nothing here is a second implementation: `AppConfiguration`, `CurrentfoldAPIClient` and
/// `KeychainCredentialStore` are the app's own files, compiled into this target too. The
/// server address comes out of the extension's `Info.plist`, which is filled from the same
/// `CURRENTFOLD_SERVER_URL` build setting the app's is, so a build cannot point the two
/// binaries at different servers.
///
/// The credential store resolves the shared keychain group, so the extension reuses the
/// reader's existing sign-in — and, because the store also refreshes through the same
/// coordinator, a token this extension renews is the token the app finds next time.
@MainActor
enum ShareExtensionEnvironment {
    static let credentialStore = KeychainCredentialStore()

    static let apiClient = CurrentfoldAPIClient.live(credentialStore: credentialStore)

    static let connection = CurrentfoldConnection(baseURL: AppConfiguration.serverURL)
}
