import SwiftUI

/// A saved page, read exactly like an article: the same serif title, the same header, and the
/// same ``ArticleHTMLView`` on the same canvas. That sameness is the product decision — Read
/// Later is one queue, so the thing you opened out of it should not announce which half of
/// the queue it came from.
///
/// What differs is only what is genuinely different: the meta line says *saved*, there is no
/// star, and Remove replaces the read-later toggle.
struct SavedPageDetailView: View {
    let savedPageID: String

    @Environment(ReaderStore.self) private var store
    @Environment(ReadingSettings.self) private var reading
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    /// Bumped only when the reader taps a toolbar verb, never when opening a page auto-marks
    /// it read — punctuation belongs to deliberate actions.
    @State private var triageTapCount = 0
    @State private var tracker = ReadingProgressTracker()
    /// The bounded poll gave up. Said out loud, because silence would read as a hang.
    @State private var copyStoppedArriving = false
    /// Bumped by "Check Again" so the restarted poll is still SwiftUI's task, and still stops
    /// when this view goes away.
    @State private var pollGeneration = 0

    /// Six attempts over about a minute, then stop and hand the reader a button.
    ///
    /// Extraction usually finishes in seconds, and the intervals lengthen because a copy that
    /// has not arrived in ten seconds is not about to arrive in the next two. The web reader
    /// shows the same restraint; a phone has a battery, so ours also stops entirely the
    /// moment the view goes away or the app leaves the foreground.
    private static let pollDelays: [Double] = [1.5, 2.5, 4, 7, 12, 20]

    private var entryID: ReaderEntryID { .savedPage(savedPageID) }

    var body: some View {
        Group {
            if let entry = store.savedPage(id: savedPageID) {
                readerView(for: entry)
            } else {
                ContentUnavailableView(
                    "Saved page unavailable",
                    systemImage: "doc.questionmark",
                    description: Text("This page is no longer in the queue you opened it from.")
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .currentfoldCanvas()
    }

    private func readerView(for entry: SavedPageEntry) -> some View {
        VStack(spacing: 0) {
            SavedPageHeader(page: entry.page)
            copy(for: entry)
        }
        .navigationTitle(entry.page.siteName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { ReadingTypographyButton() }
            ToolbarItem(placement: .topBarTrailing) { readToggle(entry) }
            ToolbarItem(placement: .topBarTrailing) { overflowMenu(entry) }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: triageTapCount)
        .task(id: savedPageID) {
            tracker.begin(at: store.resumePosition(for: entryID))
            store.beginReading(entryID)
            await store.setSavedPageRead(savedPageID: savedPageID, read: true)
        }
        .task(
            id: PollRun(
                savedPageID: savedPageID,
                phase: scenePhase,
                generation: pollGeneration
            )
        ) {
            await watchForCopy()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase != .active else { return }
            tracker.flush(to: store)
        }
        .onDisappear { tracker.flush(to: store) }
    }

    /// A saved page reads exactly like an article, progress line included — same bar, same
    /// place, same rule about only appearing when there is a body to measure.
    @ViewBuilder
    private func copy(for entry: SavedPageEntry) -> some View {
        switch entry.copyState {
        case .ready:
            if let html = entry.page.content.html, !html.isEmpty {
                ReadingProgressBar(progress: tracker.progress)
                ArticleHTMLView(
                    html: html,
                    baseURL: entry.page.url,
                    typography: reading.typography,
                    resumeAt: store.resumePosition(for: entryID),
                    onProgress: { tracker.report($0, for: entryID, to: store) }
                )
            } else {
                Divider()
                missingCopy(entry)
            }
        case .fetching:
            Divider()
            fetchingCopy(entry)
        case let .failed(reason):
            Divider()
            failedCopy(entry, reason: reason)
        }
    }

    /// Read state keeps the one always-visible slot, matching the article view: it is the verb
    /// this screen changes by merely existing, so its value has to be legible without opening
    /// a menu.
    private func readToggle(_ entry: SavedPageEntry) -> some View {
        Button {
            commit {
                await store.setSavedPageRead(
                    savedPageID: entry.id,
                    read: !entry.page.state.read
                )
            }
        } label: {
            Label(
                ReadStateIcon.toggleTitle(isRead: entry.page.state.read),
                systemImage: ReadStateIcon.toggle(isRead: entry.page.state.read)
            )
        }
    }

    private func overflowMenu(_ entry: SavedPageEntry) -> some View {
        Menu {
            Button(role: .destructive) {
                triageTapCount += 1
                Task {
                    await store.removeSavedPage(savedPageID: entry.id)
                    dismiss()
                }
            } label: {
                Label(SavedPageIcon.removeTitle, systemImage: SavedPageIcon.remove)
            }

            ShareLink(item: entry.page.url, subject: Text(entry.page.title))
            Link(destination: entry.page.url) {
                Label(SavedPageIcon.openOriginalTitle, systemImage: SavedPageIcon.openOriginal)
            }
        } label: {
            Label("More", systemImage: "ellipsis.circle")
        }
    }

    private func fetchingCopy(_ entry: SavedPageEntry) -> some View {
        ContentUnavailableView {
            Label("Fetching a readable copy", systemImage: "arrow.down.doc")
        } description: {
            Text(
                copyStoppedArriving
                    ? "This one is taking a while. It keeps going on the server — check back, or read the original."
                    : "Currentfold is pulling a readable copy of this page. It usually takes a few seconds."
            )
        } actions: {
            if copyStoppedArriving {
                Button("Check Again") { checkAgain() }
                    .buttonStyle(.primaryAction)
            } else {
                ProgressView()
            }
            Link(SavedPageIcon.openOriginalTitle, destination: entry.page.url)
        }
    }

    private func failedCopy(_ entry: SavedPageEntry, reason: String?) -> some View {
        ContentUnavailableView {
            Label("No readable copy", systemImage: "doc.text.magnifyingglass")
        } description: {
            Text(reason ?? "Currentfold couldn’t fetch this page. The original still has it.")
        } actions: {
            Button(SavedPageIcon.retryTitle) {
                commit { await store.retrySavedPage(savedPageID: entry.id) }
            }
            .buttonStyle(.primaryAction)
            Link(SavedPageIcon.openOriginalTitle, destination: entry.page.url)
        }
    }

    /// `ready` with nothing in it: the extraction succeeded and found no article. Rare, and
    /// not a failure the reader can retry their way out of.
    private func missingCopy(_ entry: SavedPageEntry) -> some View {
        ContentUnavailableView {
            Label("Nothing readable here", systemImage: "doc.text.magnifyingglass")
        } description: {
            Text("Currentfold found no article text on this page. The original has whatever is there.")
        } actions: {
            Link(SavedPageIcon.openOriginalTitle, destination: entry.page.url)
                .buttonStyle(.primaryAction)
        }
    }

    private func commit(_ mutation: @escaping @MainActor () async -> Void) {
        triageTapCount += 1
        Task { await mutation() }
    }

    private func checkAgain() {
        copyStoppedArriving = false
        pollGeneration += 1
    }

    /// Polls only while there is something to poll for, and only while this view is on screen
    /// and the app is in front. SwiftUI cancels the task when either stops being true, because
    /// both are in the task's id.
    private func watchForCopy() async {
        guard scenePhase == .active,
              store.savedPage(id: savedPageID)?.copyState == .fetching
        else {
            return
        }
        for delay in Self.pollDelays {
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            guard store.savedPage(id: savedPageID)?.copyState == .fetching else { return }
            let found = await store.refreshSavedPageCopies(watching: savedPageID)
            guard !Task.isCancelled else { return }
            guard store.savedPage(id: savedPageID)?.copyState == .fetching else { return }
            // Not on the first page any more: the stream has moved past it and asking again
            // would only ask the same wrong question.
            guard found else { break }
        }
        copyStoppedArriving = true
    }

    /// The identity of one polling run. Folding the scene phase in is what makes the poll
    /// stop when the app is backgrounded and start over when it comes back; the generation is
    /// how "Check Again" restarts it without owning a task of its own.
    private struct PollRun: Hashable {
        let savedPageID: String
        let phase: ScenePhase
        let generation: Int
    }
}

private struct SavedPageHeader: View {
    let page: APISavedPage

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(page.title)
                .font(.system(.title, design: .serif, weight: .semibold))
            HStack(spacing: 5) {
                Image(systemName: SavedPageIcon.marker)
                    .font(.caption)
                    .accessibilityHidden(true)
                Text(page.siteName)
                if let author = page.author {
                    Text("·")
                    Text(author)
                }
                if let displayDate = page.displayDate {
                    Text("·")
                    Text("saved \(displayDate)")
                }
                if let readingTime = page.readingTimeLabel {
                    Text("·")
                    Text(readingTime)
                }
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }
}

#Preview("Saved page") {
    NavigationStack {
        SavedPageDetailView(savedPageID: APISavedPage.readyFixture.id)
    }
    .environment(PreviewFixtures.readerStore(savedPages: [.readyFixture], filter: .readLater))
    .environment(ReadingSettings.ephemeral())
}

#Preview("Still fetching") {
    NavigationStack {
        SavedPageDetailView(savedPageID: APISavedPage.pendingFixture.id)
    }
    .environment(PreviewFixtures.readerStore(savedPages: [.pendingFixture], filter: .readLater))
    .environment(ReadingSettings.ephemeral())
}

#Preview("Fetch failed") {
    NavigationStack {
        SavedPageDetailView(savedPageID: APISavedPage.failedFixture.id)
    }
    .environment(PreviewFixtures.readerStore(savedPages: [.failedFixture], filter: .readLater))
    .environment(ReadingSettings.ephemeral())
}
