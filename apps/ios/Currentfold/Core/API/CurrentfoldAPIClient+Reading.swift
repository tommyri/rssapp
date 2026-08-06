import Foundation

/// The three calls a reader makes that are neither a list nor a triage verb: following a new
/// source, and remembering where reading stopped in each of the two streams.
///
/// They share a file because they share a property the rest of the client does not have —
/// their answer is a *correction* rather than a confirmation. Discovery answers with the feed
/// it actually resolved, or with a question; reading progress answers with the position it
/// stored rather than the one it was sent. A caller that discards either answer will drift.
extension LiveCurrentfoldAPI {
    // MARK: - Following a source

    /// `201 subscribed` and `200 candidates` are both successes and are told apart by
    /// `data.status`, so one decode covers both; `409`, `422`, and `400` come back through the
    /// transport's ``CurrentfoldAPIError/rejected(status:code:message:)`` with the code that
    /// says which.
    func createSubscription(
        connection: CurrentfoldConnection,
        url: String
    ) async throws -> APISubscriptionCreationResult {
        let response: DataEnvelope<APISubscriptionCreationResult> =
            try await transport.sendAuthorized(
                connection: connection,
                path: "api/v1/subscriptions",
                method: "POST",
                body: APISubscriptionCreation(url: url)
            )
        return response.data
    }

    // MARK: - Reading progress

    func updateArticleReadingProgress(
        connection: CurrentfoldConnection,
        positions: [APIArticleReadingProgressEntry]
    ) async throws -> [APIArticleReadingProgressEntry] {
        let body = APIArticleReadingProgressUpdate(positions: positions)
        let response: DataEnvelope<APIArticleReadingProgressUpdate> =
            try await transport.sendAuthorized(
                connection: connection,
                path: "api/v1/articles/reading-progress",
                method: "PATCH",
                body: body
            )
        return response.data.positions
    }

    func updateSavedPageReadingProgress(
        connection: CurrentfoldConnection,
        positions: [APISavedPageReadingProgressEntry]
    ) async throws -> [APISavedPageReadingProgressEntry] {
        let body = APISavedPageReadingProgressUpdate(positions: positions)
        let response: DataEnvelope<APISavedPageReadingProgressUpdate> =
            try await transport.sendAuthorized(
                connection: connection,
                path: "api/v1/saved-pages/reading-progress",
                method: "PATCH",
                body: body
            )
        return response.data.positions
    }
}
