import XCTest
@testable import Currentfold

final class NativeAuthLinkTests: XCTestCase {
    @MainActor
    func testRoutesVerificationUniversalLinkIntoNativeFlow() throws {
        let store = makeStore()
        let url = try XCTUnwrap(
            URL(string: "https://currentfold.example/verify-email?token=verification-secret")
        )

        store.handleIncomingURL(url)

        XCTAssertEqual(store.pendingAuthLink, .verification("verification-secret"))
    }

    @MainActor
    func testRoutesPasswordResetCustomLinkIntoNativeFlow() throws {
        let store = makeStore()
        let url = try XCTUnwrap(
            URL(string: "currentfold://reset-password?token=reset-secret")
        )

        store.handleIncomingURL(url)

        XCTAssertEqual(store.pendingAuthLink, .passwordReset("reset-secret"))
    }

    @MainActor
    func testRoutesInvitationUniversalLinkIntoRegistration() throws {
        let store = makeStore()
        let url = try XCTUnwrap(
            URL(string: "https://currentfold.example/signup?invite=invite-secret")
        )

        store.handleIncomingURL(url)

        XCTAssertEqual(store.pendingAuthLink, .invitation("invite-secret"))
    }

    @MainActor
    private func makeStore() -> SessionStore {
        SessionStore(
            apiClient: PreviewFixtures.apiClient,
            credentialStore: KeychainCredentialStore(),
            serverURL: URL(string: "https://currentfold.example")!
        )
    }
}
