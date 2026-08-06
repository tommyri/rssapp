import Foundation

struct CurrentfoldAPIClient: Sendable {
    var fetchAuthProviders: @Sendable (URL) async throws -> APIAuthProviders
    var createAppleChallenge: @Sendable (URL) async throws -> APIAppleChallenge
    var signIn: @Sendable (URL, String, String, String) async throws -> APIAuthenticationGrant
    var providerSignIn: @Sendable (URL, APIProviderSignIn) async throws -> APIAuthenticationGrant
    var register: @Sendable (URL, String, String, String?) async throws -> APIStatusMessage
    var resendVerification: @Sendable (URL, String) async throws -> APIStatusMessage
    var requestPasswordReset: @Sendable (URL, String) async throws -> APIStatusMessage
    var verifyEmail: @Sendable (URL, String) async throws -> APIStatusMessage
    var resetPassword: @Sendable (URL, String, String) async throws -> APIStatusMessage
    var signOut: @Sendable (CurrentfoldConnection) async -> Void
    var fetchAccount: @Sendable (CurrentfoldConnection) async throws -> APIAccount
    var fetchSubscriptions: @Sendable (CurrentfoldConnection) async throws -> [APISubscription]
    var fetchArticles: @Sendable (
        CurrentfoldConnection,
        ArticleQuery,
        String?
    ) async throws -> APIArticlePage
    var updateReadState: @Sendable (
        CurrentfoldConnection,
        [String],
        Bool
    ) async throws -> Void
    var updateStarredState: @Sendable (
        CurrentfoldConnection,
        [String],
        Bool
    ) async throws -> Void
    var updateReadLaterState: @Sendable (
        CurrentfoldConnection,
        [String],
        Bool
    ) async throws -> Void
    var markAllRead: @Sendable (
        CurrentfoldConnection,
        APIMarkAllReadRequest
    ) async throws -> APIMarkAllReadResult
    var fetchSavedPages: @Sendable (
        CurrentfoldConnection,
        String?
    ) async throws -> APIPage<APISavedPage>
    var createSavedPage: @Sendable (
        CurrentfoldConnection,
        URL
    ) async throws -> APISavedPageCreationResult
    var deleteSavedPage: @Sendable (CurrentfoldConnection, String) async throws -> Void
    var retrySavedPage: @Sendable (CurrentfoldConnection, String) async throws -> APISavedPage
    var updateSavedPageReadState: @Sendable (
        CurrentfoldConnection,
        [String],
        Bool
    ) async throws -> Void
    var createSubscription: @Sendable (
        CurrentfoldConnection,
        String
    ) async throws -> APISubscriptionCreationResult
    /// Answers with the positions the server *stored*, which is not always what was sent.
    var updateArticleReadingProgress: @Sendable (
        CurrentfoldConnection,
        [APIArticleReadingProgressEntry]
    ) async throws -> [APIArticleReadingProgressEntry]
    var updateSavedPageReadingProgress: @Sendable (
        CurrentfoldConnection,
        [APISavedPageReadingProgressEntry]
    ) async throws -> [APISavedPageReadingProgressEntry]
}

extension CurrentfoldAPIClient {
    static func live(
        session: URLSession = .shared,
        credentialStore: KeychainCredentialStore
    ) -> CurrentfoldAPIClient {
        let credentials = SessionTokenCoordinator(
            session: session,
            credentialStore: credentialStore
        )
        let service = LiveCurrentfoldAPI(
            transport: APITransport(session: session, credentials: credentials),
            credentialStore: credentialStore
        )
        return CurrentfoldAPIClient(
            fetchAuthProviders: service.fetchAuthProviders,
            createAppleChallenge: service.createAppleChallenge,
            signIn: service.signIn,
            providerSignIn: service.providerSignIn,
            register: service.register,
            resendVerification: service.resendVerification,
            requestPasswordReset: service.requestPasswordReset,
            verifyEmail: service.verifyEmail,
            resetPassword: service.resetPassword,
            signOut: service.signOut,
            fetchAccount: service.fetchAccount,
            fetchSubscriptions: service.fetchSubscriptions,
            fetchArticles: service.fetchArticles,
            updateReadState: service.updateReadState,
            updateStarredState: service.updateStarredState,
            updateReadLaterState: service.updateReadLaterState,
            markAllRead: service.markAllRead,
            fetchSavedPages: service.fetchSavedPages,
            createSavedPage: service.createSavedPage,
            deleteSavedPage: service.deleteSavedPage,
            retrySavedPage: service.retrySavedPage,
            updateSavedPageReadState: service.updateSavedPageReadState,
            createSubscription: service.createSubscription,
            updateArticleReadingProgress: service.updateArticleReadingProgress,
            updateSavedPageReadingProgress: service.updateSavedPageReadingProgress
        )
    }
}

struct LiveCurrentfoldAPI: Sendable {
    /// One page is a comfortable scroll's worth; the contract's maximum is 100.
    static let articlePageSize = 50

    let transport: APITransport
    let credentialStore: KeychainCredentialStore

    func fetchAuthProviders(baseURL: URL) async throws -> APIAuthProviders {
        let response: DataEnvelope<APIAuthProviders> = try await transport.send(
            baseURL: baseURL,
            path: "api/v1/auth/providers"
        )
        return response.data
    }

    func createAppleChallenge(baseURL: URL) async throws -> APIAppleChallenge {
        let response: DataEnvelope<APIAppleChallenge> = try await transport.sendWithoutBody(
            baseURL: baseURL,
            path: "api/v1/auth/providers/apple/challenge",
            method: "POST"
        )
        return response.data
    }

    func signIn(
        baseURL: URL,
        email: String,
        password: String,
        deviceName: String
    ) async throws -> APIAuthenticationGrant {
        let body = SignInRequest(email: email, password: password, deviceName: deviceName)
        let response: DataEnvelope<APIAuthenticationGrant> = try await transport.send(
            baseURL: baseURL,
            path: "api/v1/auth/session",
            method: "POST",
            body: body
        )
        try await credentialStore.saveSession(response.data.session)
        return response.data
    }

    func providerSignIn(
        baseURL: URL,
        proof: APIProviderSignIn
    ) async throws -> APIAuthenticationGrant {
        let response: DataEnvelope<APIAuthenticationGrant> = try await transport.send(
            baseURL: baseURL,
            path: "api/v1/auth/provider-session",
            method: "POST",
            body: proof
        )
        try await credentialStore.saveSession(response.data.session)
        return response.data
    }

    func register(
        baseURL: URL,
        email: String,
        password: String,
        inviteToken: String?
    ) async throws -> APIStatusMessage {
        let body = RegistrationRequest(
            email: email,
            password: password,
            inviteToken: inviteToken
        )
        let response: DataEnvelope<APIStatusMessage> = try await transport.send(
            baseURL: baseURL,
            path: "api/v1/auth/registration",
            method: "POST",
            body: body
        )
        return response.data
    }

    func resendVerification(baseURL: URL, email: String) async throws -> APIStatusMessage {
        try await emailOperation(
            baseURL: baseURL,
            path: "api/v1/auth/verification",
            email: email
        )
    }

    func requestPasswordReset(baseURL: URL, email: String) async throws -> APIStatusMessage {
        try await emailOperation(
            baseURL: baseURL,
            path: "api/v1/auth/recovery",
            email: email
        )
    }

    func verifyEmail(baseURL: URL, token: String) async throws -> APIStatusMessage {
        let response: DataEnvelope<APIStatusMessage> = try await transport.send(
            baseURL: baseURL,
            path: "api/v1/auth/verification",
            method: "PATCH",
            body: TokenRequest(token: token)
        )
        return response.data
    }

    func resetPassword(
        baseURL: URL,
        token: String,
        password: String
    ) async throws -> APIStatusMessage {
        let response: DataEnvelope<APIStatusMessage> = try await transport.send(
            baseURL: baseURL,
            path: "api/v1/auth/recovery",
            method: "PATCH",
            body: PasswordResetRequest(token: token, password: password)
        )
        return response.data
    }

    func signOut(connection: CurrentfoldConnection) async {
        try? await transport.sendAuthorizedWithoutResponse(
            connection: connection,
            path: "api/v1/auth/session",
            method: "DELETE"
        )
        try? await credentialStore.deleteSession()
    }

    func fetchAccount(connection: CurrentfoldConnection) async throws -> APIAccount {
        let response: DataEnvelope<APIAccount> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/me"
        )
        return response.data
    }

    func fetchSubscriptions(
        connection: CurrentfoldConnection
    ) async throws -> [APISubscription] {
        let response: DataEnvelope<[APISubscription]> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/subscriptions"
        )
        return response.data
    }

    func fetchArticles(
        connection: CurrentfoldConnection,
        query: ArticleQuery,
        cursor: String?
    ) async throws -> APIArticlePage {
        var queryItems = [
            URLQueryItem(name: "limit", value: String(Self.articlePageSize)),
            URLQueryItem(name: "filter", value: query.filter.rawValue),
        ]
        if let subscriptionID = query.scope.subscriptionID {
            queryItems.append(URLQueryItem(name: "subscriptionId", value: subscriptionID))
        }
        if let folderID = query.scope.folderID {
            queryItems.append(URLQueryItem(name: "folderId", value: folderID))
        }
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/articles",
            queryItems: queryItems
        )
    }

    func updateReadState(
        connection: CurrentfoldConnection,
        articleIDs: [String],
        read: Bool
    ) async throws {
        let body = APIReadStateUpdate(articleIds: articleIDs, read: read)
        let _: DataEnvelope<APIReadStateUpdate> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/articles/read-state",
            method: "PATCH",
            body: body
        )
    }

    func updateStarredState(
        connection: CurrentfoldConnection,
        articleIDs: [String],
        starred: Bool
    ) async throws {
        let body = APIStarredStateUpdate(articleIds: articleIDs, starred: starred)
        let _: DataEnvelope<APIStarredStateUpdate> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/articles/starred-state",
            method: "PATCH",
            body: body
        )
    }

    func updateReadLaterState(
        connection: CurrentfoldConnection,
        articleIDs: [String],
        readLater: Bool
    ) async throws {
        let body = APIReadLaterStateUpdate(articleIds: articleIDs, readLater: readLater)
        let _: DataEnvelope<APIReadLaterStateUpdate> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/articles/read-later-state",
            method: "PATCH",
            body: body
        )
    }

    func markAllRead(
        connection: CurrentfoldConnection,
        request: APIMarkAllReadRequest
    ) async throws -> APIMarkAllReadResult {
        let response: DataEnvelope<APIMarkAllReadResult> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/articles/mark-all-read",
            method: "POST",
            body: request
        )
        return response.data
    }

    private func emailOperation(
        baseURL: URL,
        path: String,
        email: String
    ) async throws -> APIStatusMessage {
        let response: DataEnvelope<APIStatusMessage> = try await transport.send(
            baseURL: baseURL,
            path: path,
            method: "POST",
            body: EmailRequest(email: email)
        )
        return response.data
    }
}

private struct SignInRequest: Encodable, Sendable {
    let email: String
    let password: String
    let deviceName: String
}

private struct RegistrationRequest: Encodable, Sendable {
    let email: String
    let password: String
    let inviteToken: String?
}

private struct EmailRequest: Encodable, Sendable {
    let email: String
}

private struct TokenRequest: Encodable, Sendable {
    let token: String
}

private struct PasswordResetRequest: Encodable, Sendable {
    let token: String
    let password: String
}
