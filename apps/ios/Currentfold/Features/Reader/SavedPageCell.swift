import SwiftUI

/// A saved page's whole cell in the unified queue: the row, the verbs it can be swiped and
/// long-pressed for, and the one control a failed row needs on its face.
///
/// Its own view rather than another method on ``ArticleListView`` because a saved page's verbs
/// are genuinely a different set — no star, and Remove where an article has a flag to clear —
/// and because the failed state needs a second tap target inside the cell, which is easier to
/// reason about when the cell is a thing rather than a builder.
struct SavedPageCell: View {
    let entry: SavedPageEntry
    /// Runs the mutation and lets the list punctuate the gesture with a haptic, on the tap
    /// rather than on the round trip.
    let commit: (@escaping @MainActor () async -> Void) -> Void

    @Environment(ReaderStore.self) private var store

    var body: some View {
        if entry.isRemoved {
            // A removed page keeps its place and stops being a link: there is nothing on the
            // other side of it any more, and a row that navigates to a 404 is a worse answer
            // than a row that says what happened.
            SavedPageRow(entry: entry)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                NavigationLink {
                    SavedPageDetailView(savedPageID: entry.id)
                } label: {
                    SavedPageRow(entry: entry)
                }

                if case .failed = entry.copyState {
                    retryButton
                }
            }
            .swipeActions(edge: .leading) {
                readAction.tint(ReadStateIcon.tint)
            }
            .swipeActions(edge: .trailing) {
                removeAction.tint(SavedPageIcon.removeTint)
            }
            .contextMenu { menu }
        }
    }

    private var readAction: some View {
        Button {
            commit {
                await store.setSavedPageRead(
                    savedPageID: entry.id,
                    read: !entry.page.state.read
                )
            }
        } label: {
            Label(
                ReadStateIcon.toggleShortTitle(isRead: entry.page.state.read),
                systemImage: ReadStateIcon.toggle(isRead: entry.page.state.read)
            )
        }
    }

    /// The destructive role, which is where the red comes from — the platform owns that
    /// colour, and coral must not double as an alarm. No confirmation dialog: the row does not
    /// vanish, it settles into "Removed" and stays until a deliberate reload, which is a
    /// gentler answer than a modal in front of every swipe.
    private var removeAction: some View {
        Button(role: .destructive) {
            commit { await store.removeSavedPage(savedPageID: entry.id) }
        } label: {
            Label(SavedPageIcon.removeTitle, systemImage: SavedPageIcon.remove)
        }
    }

    /// Retry sits *on* the failed row rather than behind a swipe or inside a menu: a page that
    /// could not be fetched is asking for exactly one thing, and making the reader hunt for it
    /// would be the only interesting part of the row hidden.
    private var retryButton: some View {
        Button {
            commit { await store.retrySavedPage(savedPageID: entry.id) }
        } label: {
            Label(SavedPageIcon.retryTitle, systemImage: SavedPageIcon.retry)
                .font(.subheadline)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .padding(.leading, 19)
        .accessibilityLabel("Retry fetching a readable copy of \(entry.page.title)")
    }

    @ViewBuilder
    private var menu: some View {
        readAction

        if case .failed = entry.copyState {
            Button {
                commit { await store.retrySavedPage(savedPageID: entry.id) }
            } label: {
                Label(SavedPageIcon.retryTitle, systemImage: SavedPageIcon.retry)
            }
        }

        ShareLink(item: entry.page.url, subject: Text(entry.page.title))
        Link(destination: entry.page.url) {
            Label(SavedPageIcon.openOriginalTitle, systemImage: SavedPageIcon.openOriginal)
        }

        removeAction
    }
}
