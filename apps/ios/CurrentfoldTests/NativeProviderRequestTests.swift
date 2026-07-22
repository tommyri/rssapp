import XCTest
@testable import Currentfold

final class NativeProviderRequestTests: XCTestCase {
    func testGoogleProofOmitsAppleOnlyFields() throws {
        let request = APIProviderSignIn(
            provider: .google,
            identityToken: "google-token",
            challenge: nil,
            displayName: nil,
            deviceName: "Currentfold for iOS",
            inviteToken: nil
        )

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(request))
                as? [String: String]
        )

        XCTAssertEqual(json["provider"], "google")
        XCTAssertEqual(json["identityToken"], "google-token")
        XCTAssertNil(json["challenge"])
        XCTAssertNil(json["displayName"])
    }

    func testAppleProofCarriesItsOneTimeChallengeAndInvitation() throws {
        let request = APIProviderSignIn(
            provider: .apple,
            identityToken: "apple-token",
            challenge: "currentfold_challenge_example",
            displayName: "Reader",
            deviceName: "Currentfold for iOS",
            inviteToken: "invite-token"
        )

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(request))
                as? [String: String]
        )

        XCTAssertEqual(json["provider"], "apple")
        XCTAssertEqual(json["challenge"], "currentfold_challenge_example")
        XCTAssertEqual(json["inviteToken"], "invite-token")
    }
}
