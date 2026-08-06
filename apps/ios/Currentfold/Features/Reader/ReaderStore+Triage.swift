import Foundation

/// The article verbs: one optimistic write each, one granular rollback each, and the one
/// sweep that is deliberately *not* optimistic because it reports a number.
extension ReaderStore {
    func setRead(articleID: String, read: Bool) async {
        await setFlag(\.read, on: articleID, to: read) { ids, value in
            try await self.apiClient.updateReadState(self.connection, ids, value)
        }
    }

    func setStarred(articleID: String, starred: Bool) async {
        await setFlag(\.starred, on: articleID, to: starred) { ids, value in
            try await self.apiClient.updateStarredState(self.connection, ids, value)
        }
    }

    func setReadLater(articleID: String, readLater: Bool) async {
        await setFlag(\.readLater, on: articleID, to: readLater) { ids, value in
            try await self.apiClient.updateReadLaterState(self.connection, ids, value)
        }
    }

    /// Marks a whole scope read on the server, then applies the same sweep to everything this
    /// session has loaded and refreshes the Sources counts. Returns how many articles the
    /// server changed, or `nil` when the sweep did not happen.
    ///
    /// Deliberately not optimistic: the reader is told a number, and inventing one locally
    /// only to correct it would be worse than waiting for the real one.
    func markAllRead(scope: ArticleListScope, olderThan: Date?) async -> Int? {
        clearMutationError()
        do {
            let result = try await apiClient.markAllRead(
                connection,
                APIMarkAllReadRequest(scope: scope, olderThan: olderThan)
            )
            applySweep(scope: scope, olderThan: olderThan)
            await loadSubscriptions()
            return result.markedCount
        } catch is CancellationError {
            return nil
        } catch {
            reportMutationFailure(error.localizedDescription)
            return nil
        }
    }

    /// One optimistic flag flip with rollback. Only the field that changed is restored, so a
    /// failure cannot undo a different verb the reader committed while it was in flight.
    private func setFlag(
        _ flag: WritableKeyPath<APIArticleState, Bool>,
        on articleID: String,
        to value: Bool,
        commit: ([String], Bool) async throws -> Void
    ) async {
        guard let previous = article(id: articleID)?.state[keyPath: flag],
              previous != value
        else {
            return
        }

        apply(value, to: flag, on: articleID)
        clearMutationError()
        do {
            try await commit([articleID], value)
        } catch is CancellationError {
            apply(previous, to: flag, on: articleID)
        } catch {
            apply(previous, to: flag, on: articleID)
            reportMutationFailure(error.localizedDescription)
        }
    }

    private func applySweep(scope: ArticleListScope, olderThan: Date?) {
        for (id, article) in articlesByID where !article.state.read {
            guard scope.contains(article, subscriptions: subscriptions) else { continue }
            if let olderThan {
                guard let sortDate = article.sortDate, sortDate < olderThan else { continue }
            }
            apply(true, to: \.read, on: id)
        }
    }
}

private extension ArticleListScope {
    /// Mirrors the server's scope predicate so the local sweep marks exactly the same
    /// articles the request did.
    func contains(_ article: APIArticle, subscriptions: [APISubscription]) -> Bool {
        switch self {
        case .library:
            true
        case let .subscription(id):
            article.subscriptionId == id
        case let .folder(id):
            subscriptions.first { $0.id == article.subscriptionId }?.folder?.id == id
        }
    }
}
