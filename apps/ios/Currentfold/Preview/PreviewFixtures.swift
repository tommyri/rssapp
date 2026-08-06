import Foundation

enum PreviewFixtures {
    static let connection = CurrentfoldConnection(
        baseURL: URL(string: "https://reader.example.com")!
    )

    static let apiClient = CurrentfoldAPIClient(
        fetchAuthProviders: { _ in APIAuthProviders(apple: true, google: true) },
        createAppleChallenge: { _ in APIAppleChallenge(challenge: "preview-challenge") },
        signIn: { _, _, _, _ in
            APIAuthenticationGrant(
                account: .fixture,
                session: APISessionCredential(
                    accessToken: "preview-access",
                    accessTokenExpiresAt: "2026-07-22T12:15:00.000Z",
                    refreshToken: "preview-refresh",
                    refreshTokenExpiresAt: "2026-08-21T12:00:00.000Z"
                )
            )
        },
        providerSignIn: { _, _ in
            APIAuthenticationGrant(
                account: .fixture,
                session: APISessionCredential(
                    accessToken: "preview-access",
                    accessTokenExpiresAt: "2026-07-22T12:15:00.000Z",
                    refreshToken: "preview-refresh",
                    refreshTokenExpiresAt: "2026-08-21T12:00:00.000Z"
                )
            )
        },
        register: { _, _, _, _ in
            APIStatusMessage(status: "verification_required", message: "Check your email.")
        },
        resendVerification: { _, _ in
            APIStatusMessage(status: nil, message: "Check your email.")
        },
        requestPasswordReset: { _, _ in
            APIStatusMessage(status: nil, message: "Check your email.")
        },
        verifyEmail: { _, _ in
            APIStatusMessage(status: "verified", message: "Email verified.")
        },
        resetPassword: { _, _, _ in
            APIStatusMessage(status: nil, message: "Password reset.")
        },
        signOut: { _ in },
        fetchAccount: { _ in .fixture },
        fetchSubscriptions: { _ in [.fixture] },
        fetchArticles: { _, _, _ in
            APIArticlePage(
                data: [.fixture],
                pagination: .init(nextCursor: nil)
            )
        },
        updateReadState: { _, _, _ in },
        updateStarredState: { _, _, _ in },
        updateReadLaterState: { _, _, _ in },
        markAllRead: { _, request in
            APIMarkAllReadResult(
                scope: request.scope,
                subscriptionId: request.subscriptionId,
                folderId: request.folderId,
                olderThan: request.olderThan,
                markedCount: 12
            )
        },
        fetchSavedPages: { _, _ in
            APIPage(data: [.readyFixture], pagination: .init(nextCursor: nil))
        },
        createSavedPage: { _, _ in
            APISavedPageCreationResult(alreadySaved: false, savedPage: .pendingFixture)
        },
        deleteSavedPage: { _, _ in },
        retrySavedPage: { _, _ in .readyFixture },
        updateSavedPageReadState: { _, _, _ in },
        createSubscription: { _, _ in .subscribed(.fixture) },
        // The stored value, not the sent one — see `ReadingProgressRule`.
        updateArticleReadingProgress: { _, positions in
            positions.map {
                APIArticleReadingProgressEntry(
                    articleId: $0.articleId,
                    readingProgress: ReadingProgressRule.resumable($0.readingProgress)
                )
            }
        },
        updateSavedPageReadingProgress: { _, positions in
            positions.map {
                APISavedPageReadingProgressEntry(
                    savedPageId: $0.savedPageId,
                    readingProgress: ReadingProgressRule.resumable($0.readingProgress)
                )
            }
        }
    )

    /// A signed-out session store, for the previews that only need one in the environment.
    @MainActor
    static var sessionStore: SessionStore {
        SessionStore(apiClient: apiClient, credentialStore: KeychainCredentialStore())
    }

    /// A store whose fetches return exactly what it was seeded with, so a preview keeps showing
    /// the state it was written to demonstrate once the list opens itself.
    @MainActor
    static func readerStore(
        articles: [APIArticle] = [],
        savedPages: [APISavedPage] = [],
        subscriptions: [APISubscription] = [],
        scope: ArticleListScope = .library,
        filter: ArticleFilter = ReaderStore.defaultFilter
    ) -> ReaderStore {
        var client = apiClient
        client.fetchArticles = { _, _, _ in
            APIArticlePage(data: articles, pagination: .init(nextCursor: nil))
        }
        client.fetchSavedPages = { _, _ in
            APIPage(data: savedPages, pagination: .init(nextCursor: nil))
        }
        client.fetchSubscriptions = { _ in subscriptions }
        return ReaderStore(
            apiClient: client,
            connection: connection,
            articles: articles,
            savedPages: savedPages,
            subscriptions: subscriptions,
            articleState: .loaded,
            subscriptionState: .loaded,
            scope: scope,
            filter: filter
        )
    }
}

extension APIAccount {
    static let fixture = APIAccount(
        id: "1",
        email: "reader@example.com",
        displayName: "Reader"
    )
}

extension APISubscription {
    static let fixture = APISubscription(
        id: "7",
        title: "Example Source",
        feed: .init(
            id: "3",
            url: URL(string: "https://example.com/feed.xml")!,
            siteUrl: URL(string: "https://example.com")!
        ),
        folder: .init(id: "2", name: "Design"),
        unreadCount: 4,
        paused: false
    )

    /// Past the "1k+" cap, so previews show the capped count rather than a guilt number.
    static let busyFixture = APISubscription(
        id: "8",
        title: "A Very Prolific Source",
        feed: .init(
            id: "4",
            url: URL(string: "https://prolific.example.com/feed.xml")!,
            siteUrl: URL(string: "https://prolific.example.com")!
        ),
        folder: .init(id: "2", name: "Design"),
        unreadCount: 2431,
        paused: false
    )

    static let unfiledFixture = APISubscription(
        id: "9",
        title: "Paused Source",
        feed: .init(
            id: "5",
            url: URL(string: "https://paused.example.com/feed.xml")!,
            siteUrl: nil
        ),
        folder: nil,
        unreadCount: 0,
        paused: true
    )
}

extension APIArticle {
    static let fixture = APIArticle(
        id: "42",
        subscriptionId: "7",
        title: "A calmer way to follow the web",
        url: URL(string: "https://example.com/currentfold")!,
        canonicalUrl: URL(string: "https://example.com/currentfold")!,
        author: "Example Author",
        publishedAt: "2026-07-22T12:00:00.000Z",
        createdAt: "2026-07-22T12:01:00.000Z",
        feed: APIFeed(
            id: "3",
            title: "Example Source",
            url: URL(string: "https://example.com/feed.xml")!,
            siteUrl: URL(string: "https://example.com")!
        ),
        content: .init(
            html: "<p>A durable readable copy of an article belongs here.</p>",
            source: .full
        ),
        preview: """
        A durable readable copy is kept of every article you follow, so a post you meant to \
        read on the train is still there when the site has moved on, gone behind a wall, or \
        quietly rewritten the page.
        """,
        readingTime: 4,
        audio: nil,
        state: .init(
            read: false,
            starred: false,
            readLater: false,
            readingProgress: nil
        )
    )

    static let readFixture = fixture.varied(
        id: "43",
        title: "The list you can scan in a single pass",
        state: .init(read: true, starred: false, readLater: false, readingProgress: nil)
    )

    static let starredFixture = fixture.varied(
        id: "44",
        title: "Feedbin’s restraint with Inoreader’s power underneath",
        state: .init(read: false, starred: true, readLater: true, readingProgress: nil)
    )

    static let readLaterFixture = fixture.varied(
        id: "45",
        title: "Everything you meant to get to, in one queue",
        state: .init(read: true, starred: false, readLater: true, readingProgress: nil)
    )

    /// The row with nothing to lean on: no snippet, no reading estimate, no timestamp the
    /// formatter can read. The recipe has to stay upright anyway.
    static let sparseFixture = APIArticle(
        id: "46",
        subscriptionId: "8",
        title: "A link post",
        url: URL(string: "https://prolific.example.com/link")!,
        canonicalUrl: nil,
        author: nil,
        publishedAt: nil,
        createdAt: "not-a-timestamp",
        feed: APIFeed(
            id: "4",
            title: "A Very Prolific Source",
            url: URL(string: "https://prolific.example.com/feed.xml")!,
            siteUrl: nil
        ),
        content: .init(html: nil, source: .feed),
        preview: nil,
        readingTime: nil,
        audio: nil,
        state: .init(read: false, starred: false, readLater: false, readingProgress: nil)
    )

    /// A read-later article dated *between* the saved-page fixtures, so the unified-queue
    /// preview shows a genuine interleave rather than two blocks that happen to be adjacent.
    static let queuedFixture = fixture.varied(
        id: "47",
        title: "Two streams, one queue",
        publishedAt: "2026-07-24T08:40:00.000Z",
        state: .init(read: false, starred: false, readLater: true, readingProgress: nil)
    )

    /// The one place preview fixtures vary an article, so a new contract field only has to be
    /// added to ``fixture``.
    private func varied(
        id: String,
        title: String,
        publishedAt: String? = nil,
        state: APIArticleState
    ) -> APIArticle {
        APIArticle(
            id: id,
            subscriptionId: subscriptionId,
            title: title,
            url: url,
            canonicalUrl: canonicalUrl,
            author: author,
            publishedAt: publishedAt ?? self.publishedAt,
            createdAt: createdAt,
            feed: feed,
            content: content,
            preview: preview,
            readingTime: readingTime,
            audio: audio,
            state: state
        )
    }
}

extension APIFeedCandidate {
    /// The three shapes a picker row has to survive: a labelled feed, a second labelled feed
    /// that is *not* the one most readers want, and one the page never labelled.
    static let postsFixture = APIFeedCandidate(
        url: URL(string: "https://example.com/feed.xml")!,
        title: "Example Source — Posts"
    )
    static let commentsFixture = APIFeedCandidate(
        url: URL(string: "https://example.com/comments/feed.xml")!,
        title: "Example Source — Comments"
    )
    static let unlabelledFixture = APIFeedCandidate(
        url: URL(string: "https://example.com/notes.json")!,
        title: nil
    )
}

extension APISavedPage {
    /// A page whose copy arrived: the ordinary saved-page row, and the one that reads exactly
    /// like an article.
    static let readyFixture = APISavedPage(
        id: "31",
        url: URL(string: "https://example.org/essays/the-quiet-web")!,
        title: "The quiet web",
        siteName: "Example Essays",
        author: "Example Author",
        savedAt: "2026-07-24T09:15:00.000Z",
        extraction: .init(status: .ready, error: nil),
        content: .init(
            html: "<p>A saved page reads exactly like a feed article: the same sanitized "
                + "markup, the same column, the same triage verbs.</p>"
        ),
        preview: """
        A saved page reads exactly like a feed article: the same sanitized markup, the same \
        column, the same triage verbs. Only the meta line differs, because a saved page has a \
        save time rather than a publication date.
        """,
        readingTime: 1,
        state: .init(read: false, readingProgress: 0.42)
    )

    /// Seconds after a share sheet dismissed: title and site name fall back to the URL, and
    /// there is nothing to preview yet. The row has to stand up anyway.
    static let pendingFixture = APISavedPage(
        id: "30",
        url: URL(string: "https://example.net/long-read")!,
        title: "https://example.net/long-read",
        siteName: "example.net",
        author: nil,
        savedAt: "2026-07-24T08:02:00.000Z",
        extraction: .init(status: .pending, error: nil),
        content: .init(html: nil),
        preview: nil,
        readingTime: nil,
        state: .init(read: false, readingProgress: nil)
    )

    static let failedFixture = APISavedPage(
        id: "29",
        url: URL(string: "https://example.com/members-only")!,
        title: "https://example.com/members-only",
        siteName: "example.com",
        author: nil,
        savedAt: "2026-07-23T19:40:00.000Z",
        extraction: .init(status: .failed, error: "Could not fetch page: HTTP 403 Forbidden"),
        content: .init(html: nil),
        preview: nil,
        readingTime: nil,
        state: .init(read: true, readingProgress: nil)
    )
}

extension SavedPageEntry {
    static let readyFixture = SavedPageEntry(
        page: .readyFixture,
        isRemoved: false,
        isRetrying: false
    )
    static let pendingFixture = SavedPageEntry(
        page: .pendingFixture,
        isRemoved: false,
        isRetrying: false
    )
    static let failedFixture = SavedPageEntry(
        page: .failedFixture,
        isRemoved: false,
        isRetrying: false
    )
    static let retryingFixture = SavedPageEntry(
        page: .failedFixture,
        isRemoved: false,
        isRetrying: true
    )
    static let removedFixture = SavedPageEntry(
        page: .readyFixture,
        isRemoved: true,
        isRetrying: false
    )
}
