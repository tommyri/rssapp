import Foundation

/// The saved-page half of the live client. Split out because the file it came from was
/// long enough already, and because these five calls are one feature: the unified Read
/// Later queue's second stream, plus the two verbs only a saved page has.
extension LiveCurrentfoldAPI {
    // MARK: - Saved pages

    func fetchSavedPages(
        connection: CurrentfoldConnection,
        cursor: String?
    ) async throws -> APIPage<APISavedPage> {
        var queryItems = [URLQueryItem(name: "limit", value: String(Self.articlePageSize))]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/saved-pages",
            queryItems: queryItems
        )
    }

    func createSavedPage(
        connection: CurrentfoldConnection,
        url: URL
    ) async throws -> APISavedPageCreationResult {
        let response: DataEnvelope<APISavedPageCreationResult> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/saved-pages",
            method: "POST",
            body: APISavedPageCreation(url: url)
        )
        return response.data
    }

    /// `204`, so there is no envelope to decode — only the status to believe.
    func deleteSavedPage(connection: CurrentfoldConnection, savedPageID: String) async throws {
        try await transport.sendAuthorizedWithoutResponse(
            connection: connection,
            path: "api/v1/saved-pages/\(savedPageID)",
            method: "DELETE"
        )
    }

    /// Unlike saving, retrying waits for the fetch and answers with the outcome, so the caller
    /// gets a page that is already `ready` or already `failed` again.
    func retrySavedPage(
        connection: CurrentfoldConnection,
        savedPageID: String
    ) async throws -> APISavedPage {
        let response: DataEnvelope<APISavedPageEnvelope> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/saved-pages/\(savedPageID)/retry",
            method: "POST"
        )
        return response.data.savedPage
    }

    func updateSavedPageReadState(
        connection: CurrentfoldConnection,
        savedPageIDs: [String],
        read: Bool
    ) async throws {
        let body = APISavedPageReadStateUpdate(savedPageIds: savedPageIDs, read: read)
        let _: DataEnvelope<APISavedPageReadStateUpdate> = try await transport.sendAuthorized(
            connection: connection,
            path: "api/v1/saved-pages/read-state",
            method: "PATCH",
            body: body
        )
    }
}
