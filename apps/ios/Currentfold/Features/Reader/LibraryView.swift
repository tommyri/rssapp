import SwiftUI

/// The account-wide stream, and the app's home. It is ``ArticleListView`` at the `.library`
/// scope — the Library and a pushed source list are the same screen with a different scope, so
/// the row recipe, the triage verbs, and the view switcher cannot drift apart between them.
struct LibraryView: View {
    var body: some View {
        ArticleListView(destination: .library)
    }
}

#Preview("Unread library") {
    NavigationStack { LibraryView() }
        .environment(
            PreviewFixtures.readerStore(
                articles: [.fixture, .starredFixture, .sparseFixture, .readLaterFixture],
                subscriptions: [.fixture]
            )
        )
}

#Preview("All articles") {
    NavigationStack { LibraryView() }
        .environment(
            PreviewFixtures.readerStore(
                articles: [.fixture, .readFixture, .starredFixture],
                subscriptions: [.fixture],
                filter: .all
            )
        )
}

#Preview("Read Later, one queue") {
    NavigationStack { LibraryView() }
        .environment(
            PreviewFixtures.readerStore(
                articles: [.queuedFixture, .readLaterFixture],
                savedPages: [.readyFixture, .pendingFixture, .failedFixture],
                subscriptions: [.fixture],
                filter: .readLater
            )
        )
}

#Preview("Starred, empty") {
    NavigationStack { LibraryView() }
        .environment(
            PreviewFixtures.readerStore(subscriptions: [.fixture], filter: .starred)
        )
}

#Preview("Caught up") {
    NavigationStack { LibraryView() }
        .environment(PreviewFixtures.readerStore(subscriptions: [.fixture]))
}

#Preview("No sources yet") {
    NavigationStack { LibraryView() }
        .environment(PreviewFixtures.readerStore())
}
