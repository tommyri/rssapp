import Foundation

/// Reading-progress sync for both kinds of row.
///
/// The store owns the queue rather than the screen that produced the scroll, for the same
/// reason it owns everything else: a reader can leave an article mid-sentence, open another,
/// and background the app, and all three positions have to reach the server. A buffer that
/// lived on the article view would be torn down with it.
///
/// **Failures are silent and retried, never surfaced.** A resume position is a convenience;
/// putting an alert in front of a reader because a scroll offset did not save would be worse
/// than the missing offset. So a refused batch goes back into the queue and the next flush —
/// the next quiet moment, the next screen closing, the next backgrounding — carries it again.
extension ReaderStore {
    // MARK: - Reading

    /// Where this row should be put back, or `nil` when nothing is worth restoring.
    func resumePosition(for id: ReaderEntryID) -> Double? {
        ReadingProgressRule.resumable(storedProgress(for: id))
    }

    /// A reader opened this row. Tells the queue what the server already holds, so restoring a
    /// position and reporting it back is not mistaken for the reader having moved.
    func beginReading(_ id: ReaderEntryID) {
        readingProgress.remember(stored: storedProgress(for: id), for: id)
    }

    /// A live scroll position, normalized the way the server will normalize it. Queued only;
    /// nothing goes out until ``flushReadingProgress()``.
    func recordReadingProgress(_ progress: Double, for id: ReaderEntryID) {
        readingProgress.record(ReadingProgressRule.stored(progress), for: id)
    }

    // MARK: - Writing

    /// Writes everything queued, both streams at once.
    ///
    /// Serialized against itself: a flush that arrives while one is running waits for it
    /// rather than being dropped, because the flush that matters most is the last one — the
    /// screen closing or the app leaving the foreground — and that is exactly the one a
    /// "already busy, skip" guard would throw away.
    func flushReadingProgress() async {
        let previous = readingProgressFlush
        let flush = Task { @MainActor [weak self] in
            await previous?.value
            await self?.writeQueuedReadingProgress()
        }
        readingProgressFlush = flush
        await flush.value
    }

    private func writeQueuedReadingProgress() async {
        guard !readingProgress.isEmpty else { return }
        let batch = readingProgress.takeBatch()
        guard !batch.isEmpty else { return }

        async let articles = write(articles: batch.articles)
        async let savedPages = write(savedPages: batch.savedPages)
        let (articleOutcome, savedPageOutcome) = await (articles, savedPages)

        switch articleOutcome {
        case let .stored(positions):
            readingProgress.acknowledge(articles: positions)
            for entry in positions {
                articlesByID[entry.articleId]?.state.readingProgress = entry.readingProgress
            }
        case .refused:
            readingProgress.requeue(articles: batch.articles)
        case .nothingToDo:
            break
        }

        switch savedPageOutcome {
        case let .stored(positions):
            readingProgress.acknowledge(savedPages: positions)
            for entry in positions {
                savedPagesByID[entry.savedPageId]?.state.readingProgress = entry.readingProgress
            }
        case .refused:
            readingProgress.requeue(savedPages: batch.savedPages)
        case .nothingToDo:
            break
        }
    }

    /// What one half of a flush did. `nothingToDo` is not `stored([])`: an empty half must not
    /// be mistaken for a server that stored nothing.
    private enum WriteOutcome<Entry: Sendable>: Sendable {
        case nothingToDo
        case stored([Entry])
        case refused
    }

    /// `nonisolated` so the two halves genuinely overlap instead of taking turns on the main
    /// actor, matching how the two list streams are fetched.
    private nonisolated func write(
        articles: [APIArticleReadingProgressEntry]
    ) async -> WriteOutcome<APIArticleReadingProgressEntry> {
        guard !articles.isEmpty else { return .nothingToDo }
        do {
            return .stored(try await apiClient.updateArticleReadingProgress(connection, articles))
        } catch {
            return .refused
        }
    }

    private nonisolated func write(
        savedPages: [APISavedPageReadingProgressEntry]
    ) async -> WriteOutcome<APISavedPageReadingProgressEntry> {
        guard !savedPages.isEmpty else { return .nothingToDo }
        do {
            return .stored(
                try await apiClient.updateSavedPageReadingProgress(connection, savedPages)
            )
        } catch {
            return .refused
        }
    }

    /// `flatMap` rather than optional chaining: an unknown row and a known row with no stored
    /// position are the same answer here, and chaining would nest the two optionals.
    private func storedProgress(for id: ReaderEntryID) -> Double? {
        switch id {
        case let .article(articleID):
            articlesByID[articleID].flatMap(\.state.readingProgress)
        case let .savedPage(savedPageID):
            savedPagesByID[savedPageID].flatMap(\.state.readingProgress)
        }
    }
}
