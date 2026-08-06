import Foundation

/// The saved-page half of ``ReaderStore``: the second normalized entity, its three verbs, and
/// the one read that exists only so a detail view can watch a copy arrive.
///
/// Everything here obeys the same two rules the article half does — one stored copy per row,
/// and a list never rearranges itself under a reader — with one addition that is particular
/// to saved pages: **Remove deletes, and deletion is not a state change.** A removed page has
/// nothing left on the server to re-read, so it is tracked here as a session-local tombstone.
/// The row keeps its place, says it is removed, and stops being a link; a deliberate reload
/// is what makes it disappear. Collapsing the rows under a finger mid-scan is exactly the
/// behaviour the session-stable rule exists to prevent, and Remove is no more entitled to it
/// than un-starring is.
extension ReaderStore {
    // MARK: - Reading

    /// A saved page resolved into what the reader sees, session-local state included.
    func savedPage(id: String) -> SavedPageEntry? {
        guard let page = savedPagesByID[id] else { return nil }
        return SavedPageEntry(
            page: page,
            isRemoved: removedSavedPageIDs.contains(id),
            isRetrying: retryingSavedPageIDs.contains(id)
        )
    }

    func remember(savedPages pages: [APISavedPage]) {
        for page in pages {
            savedPagesByID[page.id] = page
        }
    }

    // MARK: - Verbs

    /// Optimistic, with rollback — the same contract the article verbs keep, and the same
    /// reason: the tap has to land before the network does.
    func setSavedPageRead(savedPageID: String, read: Bool) async {
        guard let previous = savedPagesByID[savedPageID]?.state.read, previous != read else {
            return
        }
        applyRead(read, to: savedPageID)
        clearMutationError()
        do {
            try await apiClient.updateSavedPageReadState(connection, [savedPageID], read)
        } catch is CancellationError {
            applyRead(previous, to: savedPageID)
        } catch {
            applyRead(previous, to: savedPageID)
            reportMutationFailure(error.localizedDescription)
        }
    }

    /// Remove — the read-later verb, and the only exit a saved page has.
    ///
    /// Optimistic like the rest, so the row settles the instant the swipe commits; a refusal
    /// puts it back exactly where it was, unremoved, and says why.
    func removeSavedPage(savedPageID: String) async {
        guard savedPagesByID[savedPageID] != nil,
              !removedSavedPageIDs.contains(savedPageID)
        else {
            return
        }
        removedSavedPageIDs.insert(savedPageID)
        clearMutationError()
        do {
            try await apiClient.deleteSavedPage(connection, savedPageID)
        } catch is CancellationError {
            removedSavedPageIDs.remove(savedPageID)
        } catch {
            removedSavedPageIDs.remove(savedPageID)
            reportMutationFailure(error.localizedDescription)
        }
    }

    /// Asks for the readable copy again after a terminal failure.
    ///
    /// Not optimistic in the usual sense — there is no value to guess — but the row does go
    /// to "fetching" for the duration, because the request genuinely waits for the outcome
    /// and a reader who tapped Retry should not be looking at the old error while it runs.
    func retrySavedPage(savedPageID: String) async {
        guard let page = savedPagesByID[savedPageID],
              page.extraction.status == .failed,
              !retryingSavedPageIDs.contains(savedPageID)
        else {
            return
        }
        retryingSavedPageIDs.insert(savedPageID)
        clearMutationError()
        defer { retryingSavedPageIDs.remove(savedPageID) }

        do {
            let refreshed = try await apiClient.retrySavedPage(connection, savedPageID)
            savedPagesByID[refreshed.id] = refreshed
        } catch is CancellationError {
            return
        } catch {
            reportMutationFailure(error.localizedDescription)
        }
    }

    // MARK: - Watching a copy arrive

    /// Re-reads the newest saved pages so a row still being extracted can pick up its copy.
    ///
    /// The contract has no per-page read — a saved page is only ever delivered inside its
    /// stream — so this asks for the first page, which is where a page saved minutes ago is.
    /// Returns `false` when the page was not on it, which is the caller's signal to stop
    /// guessing rather than to keep asking a question this endpoint cannot answer.
    ///
    /// Read state is deliberately not taken from the answer: the caller is a detail view that
    /// has just auto-marked this page read, and a poll that arrives before that `PATCH` does
    /// would flip the row back to unread for a beat.
    @discardableResult
    func refreshSavedPageCopies(watching savedPageID: String) async -> Bool {
        do {
            let page = try await apiClient.fetchSavedPages(connection, nil)
            for fetched in page.data {
                var refreshed = fetched
                if let known = savedPagesByID[fetched.id] {
                    refreshed.state = known.state
                }
                savedPagesByID[fetched.id] = refreshed
            }
            return page.data.contains { $0.id == savedPageID }
        } catch {
            return false
        }
    }

    private func applyRead(_ read: Bool, to savedPageID: String) {
        savedPagesByID[savedPageID]?.state.read = read
    }
}
