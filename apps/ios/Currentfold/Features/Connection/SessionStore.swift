import Foundation
import Observation

enum PendingAuthLink: Identifiable, Equatable {
    case verification(String)
    case passwordReset(String)
    case invitation(String)

    var id: String {
        switch self {
        case let .verification(token):
            "verification:\(token)"
        case let .passwordReset(token):
            "password-reset:\(token)"
        case let .invitation(token):
            "invitation:\(token)"
        }
    }
}

@MainActor
@Observable
final class SessionStore {
    private(set) var connection: CurrentfoldConnection?
    private(set) var account: APIAccount?
    private(set) var isRestoring = true
    private(set) var isConnecting = false
    private(set) var authErrorMessage: String?
    private(set) var needsEmailVerification = false
    private(set) var pendingAuthLink: PendingAuthLink?
    private(set) var authProviders: APIAuthProviders?
    private(set) var appleChallenge: String?

    private let apiClient: CurrentfoldAPIClient
    private let credentialStore: KeychainCredentialStore
    private let serverURL: URL
    private var didRestore = false
    private var didLoadAuthProviders = false

    init(
        apiClient: CurrentfoldAPIClient,
        credentialStore: KeychainCredentialStore,
        serverURL: URL = AppConfiguration.serverURL
    ) {
        self.apiClient = apiClient
        self.credentialStore = credentialStore
        self.serverURL = serverURL
    }

    func restore() async {
        guard !didRestore else { return }
        didRestore = true
        defer { isRestoring = false }

        try? await credentialStore.deleteLegacyCredential()
        guard (try? await credentialStore.readSession()) != nil else { return }
        let restored = CurrentfoldConnection(baseURL: serverURL)
        connection = restored
        await validate(restored)
    }

    func signIn(email: String, password: String) async {
        isConnecting = true
        authErrorMessage = nil
        needsEmailVerification = false
        defer { isConnecting = false }

        do {
            let grant = try await apiClient.signIn(
                serverURL,
                email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                password,
                "Currentfold for iOS"
            )
            connection = CurrentfoldConnection(baseURL: serverURL)
            account = grant.account
        } catch is CancellationError {
            return
        } catch let error as CurrentfoldAPIError {
            if case let .rejected(_, code, _) = error,
               code == "email_unverified" {
                needsEmailVerification = true
            }
            authErrorMessage = error.localizedDescription
        } catch {
            authErrorMessage = error.localizedDescription
        }
    }

    func loadAuthProviders() async {
        guard !didLoadAuthProviders else { return }
        didLoadAuthProviders = true

        do {
            authProviders = try await apiClient.fetchAuthProviders(serverURL)
            if authProviders?.apple == true {
                await refreshAppleChallenge()
            }
        } catch {
            // Provider discovery is an enhancement to the always-available
            // email/password form. A discovery outage must not block login.
            authProviders = APIAuthProviders(apple: false, google: false)
        }
    }

    func refreshAppleChallenge() async {
        appleChallenge = nil
        guard authProviders?.apple == true else { return }
        do {
            appleChallenge = try await apiClient.createAppleChallenge(serverURL).challenge
        } catch {
            // Leave Apple unavailable for this attempt. The next completed or
            // cancelled Apple flow refreshes the one-time challenge again.
        }
    }

    func signIn(with proof: APIProviderSignIn) async {
        isConnecting = true
        authErrorMessage = nil
        needsEmailVerification = false
        defer { isConnecting = false }

        do {
            let grant = try await apiClient.providerSignIn(serverURL, proof)
            connection = CurrentfoldConnection(baseURL: serverURL)
            account = grant.account
        } catch is CancellationError {
            return
        } catch {
            authErrorMessage = error.localizedDescription
        }
    }

    func reportAuthenticationError(_ message: String) {
        authErrorMessage = message
    }

    func register(
        email: String,
        password: String,
        inviteToken: String?
    ) async -> String? {
        await performAuthRequest {
            try await self.apiClient.register(
                self.serverURL,
                email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                password,
                inviteToken
            ).message
        }
    }

    func resendVerification(email: String) async -> String? {
        await performAuthRequest {
            try await self.apiClient.resendVerification(
                self.serverURL,
                email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            ).message
        }
    }

    func requestPasswordReset(email: String) async -> String? {
        await performAuthRequest {
            try await self.apiClient.requestPasswordReset(
                self.serverURL,
                email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            ).message
        }
    }

    func verifyEmail(token: String) async -> String? {
        await performAuthRequest {
            try await self.apiClient.verifyEmail(self.serverURL, token).message
        }
    }

    func resetPassword(token: String, password: String) async -> String? {
        await performAuthRequest {
            try await self.apiClient.resetPassword(
                self.serverURL,
                token,
                password
            ).message
        }
    }

    func retry() async {
        guard let connection else { return }
        isConnecting = true
        authErrorMessage = nil
        defer { isConnecting = false }
        await validate(connection)
    }

    func signOut() async {
        if let connection {
            await apiClient.signOut(connection)
        } else {
            try? await credentialStore.deleteSession()
        }
        GoogleNativeSignIn.signOut()
        clearSession()
    }

    func expireSession() async {
        try? await credentialStore.deleteSession()
        clearSession()
        authErrorMessage = "Your session has expired. Sign in again."
    }

    func handleIncomingURL(_ url: URL) {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let route = url.scheme == "currentfold" ? url.host : url.path
        let parameter = route == "signup" || route == "/signup" ? "invite" : "token"
        guard let token = components?
            .queryItems?
            .first(where: { $0.name == parameter })?
            .value,
            !token.isEmpty
        else {
            return
        }

        if route == "verify-email" || route == "/verify-email" {
            pendingAuthLink = .verification(token)
        } else if route == "reset-password" || route == "/reset-password" {
            pendingAuthLink = .passwordReset(token)
        } else if route == "signup" || route == "/signup" {
            pendingAuthLink = .invitation(token)
        }
    }

    func dismissAuthLink() {
        pendingAuthLink = nil
        authErrorMessage = nil
    }

    func clearAuthError() {
        authErrorMessage = nil
        needsEmailVerification = false
    }

    private func performAuthRequest(
        _ request: () async throws -> String
    ) async -> String? {
        isConnecting = true
        authErrorMessage = nil
        defer { isConnecting = false }
        do {
            return try await request()
        } catch is CancellationError {
            return nil
        } catch {
            authErrorMessage = error.localizedDescription
            return nil
        }
    }

    private func validate(_ connection: CurrentfoldConnection) async {
        do {
            account = try await apiClient.fetchAccount(connection)
            authErrorMessage = nil
        } catch is CancellationError {
            return
        } catch CurrentfoldAPIError.sessionExpired {
            await expireSession()
        } catch {
            account = nil
            authErrorMessage = error.localizedDescription
        }
    }

    private func clearSession() {
        connection = nil
        account = nil
        needsEmailVerification = false
        pendingAuthLink = nil
    }
}
