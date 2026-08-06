import Foundation

/// Following a new source. One verb, but it belongs on the store rather than on the sheet
/// that calls it, because the answer changes state every tab can see: the Sources list, the
/// unread counts, and the Library's next load.
extension ReaderStore {
    /// Sends a pasted address to the discovery endpoint and, when it resolved to a new
    /// subscription, re-reads the list so Sources shows it before the sheet is even dismissed.
    ///
    /// Deliberately rethrows: `409` and `422` are not "couldn't update that" alerts, they are
    /// two of the four things this flow says, and the sheet says them. Nothing here touches
    /// ``mutationError``.
    func addSource(url: String) async throws -> APISubscriptionCreationResult {
        let result = try await apiClient.createSubscription(connection, url)
        if case .subscribed = result {
            await loadSubscriptions()
        }
        return result
    }
}
