import Foundation

struct CurrentfoldConnection: Equatable, Sendable {
    let baseURL: URL
    let token: String
}

struct CurrentfoldAPIClient: Sendable {
    var fetchAccount: @Sendable (CurrentfoldConnection) async throws -> APIAccount
    var fetchSubscriptions: @Sendable (CurrentfoldConnection) async throws -> [APISubscription]
    var fetchArticles: @Sendable (
        CurrentfoldConnection,
        String?
    ) async throws -> APIArticlePage
    var updateReadState: @Sendable (
        CurrentfoldConnection,
        [String],
        Bool
    ) async throws -> Void
}

extension CurrentfoldAPIClient {
    static func live(session: URLSession = .shared) -> CurrentfoldAPIClient {
        let transport = APITransport(session: session)
        return CurrentfoldAPIClient(
            fetchAccount: { connection in
                let response: DataEnvelope<APIAccount> = try await transport.send(
                    connection: connection,
                    path: "api/v1/me"
                )
                return response.data
            },
            fetchSubscriptions: { connection in
                let response: DataEnvelope<[APISubscription]> = try await transport.send(
                    connection: connection,
                    path: "api/v1/subscriptions"
                )
                return response.data
            },
            fetchArticles: { connection, cursor in
                var queryItems = [URLQueryItem(name: "limit", value: "50")]
                if let cursor {
                    queryItems.append(URLQueryItem(name: "cursor", value: cursor))
                }
                return try await transport.send(
                    connection: connection,
                    path: "api/v1/articles",
                    queryItems: queryItems
                )
            },
            updateReadState: { connection, articleIDs, read in
                let body = ReadStateUpdate(articleIds: articleIDs, read: read)
                let _: DataEnvelope<ReadStateUpdate> = try await transport.send(
                    connection: connection,
                    path: "api/v1/articles/read-state",
                    method: "PATCH",
                    body: body
                )
            }
        )
    }
}

enum CurrentfoldAPIError: LocalizedError {
    case invalidServerAddress
    case invalidResponse
    case rejected(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidServerAddress:
            "Enter the HTTPS address of your Currentfold server."
        case .invalidResponse:
            "The server returned a response Currentfold could not read."
        case let .rejected(_, message):
            message
        }
    }
}

private struct DataEnvelope<Value: Decodable & Sendable>: Decodable, Sendable {
    let data: Value
}

private struct ErrorEnvelope: Decodable {
    struct APIError: Decodable {
        let message: String
    }

    let error: APIError
}

private struct ReadStateUpdate: Codable, Sendable {
    let articleIds: [String]
    let read: Bool
}

private struct APITransport: Sendable {
    let session: URLSession

    func send<Response: Decodable & Sendable>(
        connection: CurrentfoldConnection,
        path: String,
        queryItems: [URLQueryItem] = [],
        method: String = "GET"
    ) async throws -> Response {
        try await send(
            connection: connection,
            path: path,
            queryItems: queryItems,
            method: method,
            encodedBody: nil
        )
    }

    func send<Response: Decodable & Sendable, Body: Encodable>(
        connection: CurrentfoldConnection,
        path: String,
        queryItems: [URLQueryItem] = [],
        method: String,
        body: Body
    ) async throws -> Response {
        try await send(
            connection: connection,
            path: path,
            queryItems: queryItems,
            method: method,
            encodedBody: try JSONEncoder().encode(body)
        )
    }

    private func send<Response: Decodable & Sendable>(
        connection: CurrentfoldConnection,
        path: String,
        queryItems: [URLQueryItem],
        method: String,
        encodedBody: Data?
    ) async throws -> Response {
        let endpoint = connection.baseURL.appending(path: path)
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
        request.setValue("Bearer \(connection.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if encodedBody != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw CurrentfoldAPIError.invalidResponse
        }
        guard 200 ..< 300 ~= http.statusCode else {
            let message = try? JSONDecoder().decode(ErrorEnvelope.self, from: data)
                .error.message
            throw CurrentfoldAPIError.rejected(
                status: http.statusCode,
                message: message ?? "The server rejected this request."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw CurrentfoldAPIError.invalidResponse
        }
    }
}
