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
        fetchArticles: { _, _ in
            APIArticlePage(
                data: [.fixture],
                pagination: .init(nextCursor: nil)
            )
        },
        updateReadState: { _, _, _ in }
    )

    @MainActor
    static func readerStore(
        articles: [APIArticle] = [],
        subscriptions: [APISubscription] = []
    ) -> ReaderStore {
        ReaderStore(
            apiClient: apiClient,
            connection: connection,
            articles: articles,
            subscriptions: subscriptions,
            articleState: .loaded,
            subscriptionState: .loaded
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
        audio: nil,
        state: .init(
            read: false,
            starred: false,
            readLater: false,
            readingProgress: nil
        )
    )
}
