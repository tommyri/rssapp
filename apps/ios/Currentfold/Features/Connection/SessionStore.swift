import Foundation
import Observation

@MainActor
@Observable
final class SessionStore {
    private(set) var connection: CurrentfoldConnection?
    private(set) var account: APIAccount?
    private(set) var isRestoring = true
    private(set) var isConnecting = false
    private(set) var errorMessage: String?

    private let apiClient: CurrentfoldAPIClient
    private let credentialStore: KeychainCredentialStore
    private let defaults: UserDefaults
    private let serverKey = "currentfold.server-url"
    private var didRestore = false

    init(
        apiClient: CurrentfoldAPIClient,
        credentialStore: KeychainCredentialStore = KeychainCredentialStore(),
        defaults: UserDefaults = .standard
    ) {
        self.apiClient = apiClient
        self.credentialStore = credentialStore
        self.defaults = defaults
    }

    func restore() async {
        guard !didRestore else { return }
        didRestore = true
        defer { isRestoring = false }

        guard let storedAddress = defaults.string(forKey: serverKey),
              let baseURL = ServerAddress.normalized(storedAddress),
              let token = try? await credentialStore.readToken()
        else {
            return
        }

        let restored = CurrentfoldConnection(baseURL: baseURL, token: token)
        connection = restored
        await validate(restored)
    }

    func connect(serverAddress: String, token: String) async {
        guard let baseURL = ServerAddress.normalized(serverAddress) else {
            errorMessage = CurrentfoldAPIError.invalidServerAddress.localizedDescription
            return
        }
        let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedToken.isEmpty else {
            errorMessage = "Paste the app credential created in Currentfold settings."
            return
        }

        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }

        let candidate = CurrentfoldConnection(baseURL: baseURL, token: trimmedToken)
        do {
            let account = try await apiClient.fetchAccount(candidate)
            try await credentialStore.saveToken(trimmedToken)
            defaults.set(baseURL.absoluteString, forKey: serverKey)
            connection = candidate
            self.account = account
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func retry() async {
        guard let connection else { return }
        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }
        await validate(connection)
    }

    func disconnect() async {
        try? await credentialStore.deleteToken()
        defaults.removeObject(forKey: serverKey)
        connection = nil
        account = nil
        errorMessage = nil
    }

    private func validate(_ connection: CurrentfoldConnection) async {
        do {
            account = try await apiClient.fetchAccount(connection)
            errorMessage = nil
        } catch is CancellationError {
            return
        } catch {
            account = nil
            errorMessage = error.localizedDescription
        }
    }
}
