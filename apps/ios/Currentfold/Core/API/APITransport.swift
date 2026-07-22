import Foundation

struct CurrentfoldConnection: Equatable, Sendable {
    let baseURL: URL
}

enum CurrentfoldAPIError: LocalizedError, Equatable {
    case invalidServerAddress
    case invalidResponse
    case serviceUpdateRequired
    case sessionExpired
    case rejected(status: Int, code: String?, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidServerAddress:
            "This version of Currentfold is not configured correctly."
        case .invalidResponse:
            "Currentfold returned a response the app could not read."
        case .serviceUpdateRequired:
            "This version of Currentfold isn’t ready for the iOS app yet. Try again after Currentfold has been updated."
        case .sessionExpired:
            "Your session has expired. Sign in again."
        case let .rejected(_, _, message):
            message
        }
    }
}

struct DataEnvelope<Value: Decodable & Sendable>: Decodable, Sendable {
    let data: Value
}

private struct ErrorEnvelope: Decodable {
    struct APIError: Decodable {
        let code: String?
        let message: String
    }

    let error: APIError
}

private struct RefreshRequest: Encodable, Sendable {
    let refreshToken: String
}

actor SessionTokenCoordinator {
    let session: URLSession
    let credentialStore: KeychainCredentialStore

    init(session: URLSession, credentialStore: KeychainCredentialStore) {
        self.session = session
        self.credentialStore = credentialStore
    }

    func accessToken() async throws -> String {
        guard let credential = try await credentialStore.readSession() else {
            throw CurrentfoldAPIError.sessionExpired
        }
        return credential.accessToken
    }

    func refresh(baseURL: URL, rejectedAccessToken: String) async throws -> String {
        guard let current = try await credentialStore.readSession() else {
            throw CurrentfoldAPIError.sessionExpired
        }
        if current.accessToken != rejectedAccessToken {
            return current.accessToken
        }

        let endpoint = baseURL.appending(path: "api/v1/auth/session/refresh")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(
            RefreshRequest(refreshToken: current.refreshToken)
        )
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw CurrentfoldAPIError.invalidResponse
        }
        guard 200 ..< 300 ~= http.statusCode else {
            if http.statusCode == 401 {
                try? await credentialStore.deleteSession()
                await MainActor.run {
                    NotificationCenter.default.post(name: .currentfoldSessionExpired, object: nil)
                }
                throw CurrentfoldAPIError.sessionExpired
            }
            throw APITransport.rejection(data: data, status: http.statusCode)
        }

        guard let grant = try? JSONDecoder().decode(
            DataEnvelope<APIAuthenticationGrant>.self,
            from: data
        ) else {
            throw CurrentfoldAPIError.invalidResponse
        }
        try await credentialStore.saveSession(grant.data.session)
        return grant.data.session.accessToken
    }
}

struct APITransport: Sendable {
    let session: URLSession
    let credentials: SessionTokenCoordinator

    func send<Response: Decodable & Sendable>(
        baseURL: URL,
        path: String,
        queryItems: [URLQueryItem] = []
    ) async throws -> Response {
        let request = try makeRequest(
            baseURL: baseURL,
            path: path,
            queryItems: queryItems,
            method: "GET"
        )
        return try await decode(request)
    }

    func sendWithoutBody<Response: Decodable & Sendable>(
        baseURL: URL,
        path: String,
        method: String
    ) async throws -> Response {
        let request = try makeRequest(
            baseURL: baseURL,
            path: path,
            method: method
        )
        return try await decode(request)
    }

    func send<Response: Decodable & Sendable, Body: Encodable>(
        baseURL: URL,
        path: String,
        method: String,
        body: Body
    ) async throws -> Response {
        let request = try makeRequest(
            baseURL: baseURL,
            path: path,
            method: method,
            encodedBody: try JSONEncoder().encode(body)
        )
        return try await decode(request)
    }

    func sendAuthorized<Response: Decodable & Sendable>(
        connection: CurrentfoldConnection,
        path: String,
        queryItems: [URLQueryItem] = [],
        method: String = "GET"
    ) async throws -> Response {
        try await sendAuthorized(
            connection: connection,
            path: path,
            queryItems: queryItems,
            method: method,
            encodedBody: nil
        )
    }

    func sendAuthorized<Response: Decodable & Sendable, Body: Encodable>(
        connection: CurrentfoldConnection,
        path: String,
        queryItems: [URLQueryItem] = [],
        method: String,
        body: Body
    ) async throws -> Response {
        try await sendAuthorized(
            connection: connection,
            path: path,
            queryItems: queryItems,
            method: method,
            encodedBody: try JSONEncoder().encode(body)
        )
    }

    func sendAuthorizedWithoutResponse(
        connection: CurrentfoldConnection,
        path: String,
        method: String
    ) async throws {
        let accessToken = try await credentials.accessToken()
        var request = try makeRequest(
            baseURL: connection.baseURL,
            path: path,
            method: method,
            bearerToken: accessToken
        )
        var result = try await session.data(for: request)
        guard let firstHTTP = result.1 as? HTTPURLResponse else {
            throw CurrentfoldAPIError.invalidResponse
        }
        if firstHTTP.statusCode == 401 {
            let renewed = try await credentials.refresh(
                baseURL: connection.baseURL,
                rejectedAccessToken: accessToken
            )
            request.setValue("Bearer \(renewed)", forHTTPHeaderField: "Authorization")
            result = try await session.data(for: request)
        }
        guard let http = result.1 as? HTTPURLResponse else {
            throw CurrentfoldAPIError.invalidResponse
        }
        guard 200 ..< 300 ~= http.statusCode else {
            throw Self.rejection(data: result.0, status: http.statusCode)
        }
    }

    private func sendAuthorized<Response: Decodable & Sendable>(
        connection: CurrentfoldConnection,
        path: String,
        queryItems: [URLQueryItem],
        method: String,
        encodedBody: Data?
    ) async throws -> Response {
        let accessToken = try await credentials.accessToken()
        var request = try makeRequest(
            baseURL: connection.baseURL,
            path: path,
            queryItems: queryItems,
            method: method,
            encodedBody: encodedBody,
            bearerToken: accessToken
        )

        let first = try await session.data(for: request)
        guard let firstHTTP = first.1 as? HTTPURLResponse else {
            throw CurrentfoldAPIError.invalidResponse
        }
        if firstHTTP.statusCode == 401 {
            let renewed = try await credentials.refresh(
                baseURL: connection.baseURL,
                rejectedAccessToken: accessToken
            )
            request.setValue("Bearer \(renewed)", forHTTPHeaderField: "Authorization")
            return try await decode(request)
        }
        return try decode(data: first.0, response: firstHTTP)
    }

    private func makeRequest(
        baseURL: URL,
        path: String,
        queryItems: [URLQueryItem] = [],
        method: String,
        encodedBody: Data? = nil,
        bearerToken: String? = nil
    ) throws -> URLRequest {
        let endpoint = baseURL.appending(path: path)
        guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)
        else {
            throw CurrentfoldAPIError.invalidServerAddress
        }
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components.url else {
            throw CurrentfoldAPIError.invalidServerAddress
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = encodedBody
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }
        if encodedBody != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func decode<Response: Decodable & Sendable>(
        _ request: URLRequest
    ) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw CurrentfoldAPIError.invalidResponse
        }
        return try decode(data: data, response: http)
    }

    private func decode<Response: Decodable & Sendable>(
        data: Data,
        response: HTTPURLResponse
    ) throws -> Response {
        if Self.isWebLoginFallback(response) {
            throw CurrentfoldAPIError.serviceUpdateRequired
        }
        guard 200 ..< 300 ~= response.statusCode else {
            throw Self.rejection(data: data, status: response.statusCode)
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw CurrentfoldAPIError.invalidResponse
        }
    }

    static func rejection(data: Data, status: Int) -> CurrentfoldAPIError {
        let error = try? JSONDecoder().decode(ErrorEnvelope.self, from: data).error
        return .rejected(
            status: status,
            code: error?.code,
            message: error?.message ?? "Currentfold couldn’t complete this request."
        )
    }

    private static func isWebLoginFallback(_ response: HTTPURLResponse) -> Bool {
        if response.url?.path == "/login" {
            return true
        }
        guard let location = response.value(forHTTPHeaderField: "location"),
              let url = URL(string: location, relativeTo: response.url)
        else {
            return false
        }
        return url.path == "/login"
    }
}

extension Notification.Name {
    static let currentfoldSessionExpired = Notification.Name("currentfold.session-expired")
}
