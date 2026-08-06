import XCTest
@testable import Currentfold

/// Following a source from a pasted address.
///
/// The endpoint has four answers and the whole point of the flow is that each one is a
/// different thing to *say*, so every test below is about which of the four the reader ends up
/// looking at — and, for the two that are not failures, about what happens next.
@MainActor
final class AddFeedTests: XCTestCase {
    func testASiteThatResolvesIsFollowedAndTheSourceListIsRefreshed() async {
        let discovery = SourceDiscovery()
        await discovery.stub("https://example.com", .subscribed(.fixture))
        let sources = SubscriptionSource([[.fixture]])
        let store = ReaderTestStore.make(discovery: discovery, subscriptionSource: sources)
        let model = AddFeedModel(store: store)

        model.url = "https://example.com"
        await model.submit()

        let fetches = await sources.fetches()
        XCTAssertEqual(model.stage, .added(.fixture))
        XCTAssertNil(model.failure)
        XCTAssertEqual(fetches, 1, "the source list is re-read, not patched locally")
        XCTAssertEqual(store.subscriptions.map(\.id), ["7"], "Sources shows it without a visit")
    }

    /// The address is trimmed but not otherwise touched: the server owns canonicalization, and
    /// a bare host is something it knows how to resolve.
    func testTheTypedAddressGoesToTheServerUntouched() async {
        let discovery = SourceDiscovery()
        await discovery.stub("example.com", .subscribed(.fixture))
        let store = ReaderTestStore.make(discovery: discovery)
        let model = AddFeedModel(store: store)

        model.url = "  example.com \n"
        await model.submit()

        let requests = await discovery.requests()
        XCTAssertEqual(requests, ["example.com"])
        XCTAssertEqual(model.stage, .added(.fixture))
    }

    func testABlankAddressAsksTheServerNothing() async {
        let discovery = SourceDiscovery()
        let store = ReaderTestStore.make(discovery: discovery)
        let model = AddFeedModel(store: store)

        model.url = "   "
        XCTAssertFalse(model.canSubmit)
        await model.submit()

        let requests = await discovery.requests()
        XCTAssertTrue(requests.isEmpty)
        XCTAssertEqual(model.stage, .entry)
    }

    // MARK: - The picker

    /// A page advertising several feeds is a question, and nothing has been subscribed.
    func testSeveralFeedsBecomeAPickerRatherThanAGuess() async {
        let discovery = SourceDiscovery()
        await discovery.stub(
            "https://example.com",
            .candidates([.postsFixture, .commentsFixture])
        )
        let store = ReaderTestStore.make(discovery: discovery)
        let model = AddFeedModel(store: store)

        model.url = "https://example.com"
        await model.submit()

        XCTAssertEqual(model.stage, .choosing([.postsFixture, .commentsFixture]))
        XCTAssertTrue(store.subscriptions.isEmpty)
    }

    /// Answering means POSTing the *chosen candidate* back, not what was originally typed —
    /// re-sending the site would only produce the same question again.
    func testChoosingACandidateSendsThatCandidateBack() async {
        let discovery = SourceDiscovery()
        await discovery.stub(
            "https://example.com",
            .candidates([.postsFixture, .commentsFixture])
        )
        await discovery.stub(APIFeedCandidate.commentsFixture.url.absoluteString, .subscribed(.fixture))
        let store = ReaderTestStore.make(discovery: discovery)
        let model = AddFeedModel(store: store)

        model.url = "https://example.com"
        await model.submit()
        await model.choose(.commentsFixture)

        let requests = await discovery.requests()
        XCTAssertEqual(
            requests,
            ["https://example.com", "https://example.com/comments/feed.xml"]
        )
        XCTAssertEqual(model.stage, .added(.fixture))
    }

    // MARK: - The two refusals

    /// Already following is not an error: the account has it, so the useful thing to offer is
    /// the way to it. The refusal does not name the source, so it is matched locally by host.
    func testAlreadyFollowingOffersTheSourceItResolvedTo() async {
        let discovery = SourceDiscovery()
        await discovery.stub("https://example.com/some/post", refusal: .alreadySubscribed)
        let store = ReaderTestStore.make(
            discovery: discovery,
            subscriptionSource: SubscriptionSource([[.fixture]])
        )
        let model = AddFeedModel(store: store)

        model.url = "https://example.com/some/post"
        await model.submit()

        XCTAssertEqual(model.stage, .alreadyFollowing(.fixture))
        XCTAssertNil(model.failure, "not a failure — the account already has it")
    }

    /// When more than one followed source lives at that host, which one the paste resolved to
    /// cannot be known from here, and offering the wrong one is worse than offering nothing.
    func testAlreadyFollowingStaysHonestWhenTheHostIsAmbiguous() async {
        let discovery = SourceDiscovery()
        await discovery.stub("example.com", refusal: .alreadySubscribed)
        let store = ReaderTestStore.make(
            discovery: discovery,
            subscriptionSource: SubscriptionSource([[.fixture, .sameHostFixture]])
        )
        let model = AddFeedModel(store: store)

        model.url = "example.com"
        await model.submit()

        XCTAssertEqual(model.stage, .alreadyFollowing(nil))
    }

    /// The server's message says what it tried; a generic line would throw that away.
    func testNoFeedFoundShowsTheServersOwnReason() async {
        let discovery = SourceDiscovery()
        await discovery.stub(
            "https://example.com/members",
            refusal: .rejected(
                status: 422,
                code: "feed_not_found",
                message: "Could not fetch page: HTTP 403 Forbidden"
            )
        )
        let store = ReaderTestStore.make(discovery: discovery)
        let model = AddFeedModel(store: store)

        model.url = "https://example.com/members"
        await model.submit()

        XCTAssertEqual(model.stage, .entry, "the reader stays on the field they can correct")
        XCTAssertEqual(model.failure, "Could not fetch page: HTTP 403 Forbidden")
        XCTAssertNil(
            store.mutationError,
            "a refused paste belongs in the sheet, not behind a “couldn’t update that” alert"
        )
    }

    func testAnInvalidBodyAlsoSurfacesTheServersMessage() async {
        let discovery = SourceDiscovery()
        await discovery.stub(
            "not a url",
            refusal: .rejected(
                status: 400,
                code: "invalid_body",
                message: "Provide a feed or site url."
            )
        )
        let store = ReaderTestStore.make(discovery: discovery)
        let model = AddFeedModel(store: store)

        model.url = "not a url"
        await model.submit()

        XCTAssertEqual(model.failure, "Provide a feed or site url.")
    }

    /// Correcting a typo should not mean retyping the address.
    func testStartingOverKeepsWhatWasTypedAndClearsTheFailure() async {
        let discovery = SourceDiscovery()
        await discovery.stub("https://example.com", .candidates([.postsFixture, .commentsFixture]))
        let store = ReaderTestStore.make(discovery: discovery)
        let model = AddFeedModel(store: store)

        model.url = "https://example.com"
        await model.submit()
        model.startOver()

        XCTAssertEqual(model.stage, .entry)
        XCTAssertEqual(model.url, "https://example.com")
        XCTAssertNil(model.failure)
    }

    // MARK: - Host matching

    func testHostsCompareWithoutSchemeOrWww() {
        XCTAssertEqual(AddFeedModel.host(of: "example.com"), "example.com")
        XCTAssertEqual(AddFeedModel.host(of: "https://www.Example.com/feed.xml"), "example.com")
        XCTAssertEqual(AddFeedModel.host(of: "http://example.com:8080/x"), "example.com")
        XCTAssertNil(AddFeedModel.host(of: "   "))
    }
}

private extension APISubscription {
    /// A second source at the same host as ``fixture``, which is what makes an
    /// already-following match ambiguous.
    static let sameHostFixture = APISubscription(
        id: "11",
        title: "Example Source — Comments",
        feed: .init(
            id: "12",
            url: URL(string: "https://example.com/comments/feed.xml")!,
            siteUrl: URL(string: "https://example.com")!
        ),
        folder: nil,
        unreadCount: 0,
        paused: false
    )
}
