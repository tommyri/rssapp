import XCTest
@testable import Currentfold

final class ServerAddressTests: XCTestCase {
    func testAcceptsSecureProductionAndLocalDevelopmentAddresses() {
        XCTAssertEqual(
            ServerAddress.normalized(" https://Reader.Example.com/ ")?.absoluteString,
            "https://reader.example.com/"
        )
        XCTAssertEqual(
            ServerAddress.normalized("http://localhost:3000")?.absoluteString,
            "http://localhost:3000"
        )
    }

    func testRejectsInsecureRemoteAndCredentialBearingAddresses() {
        XCTAssertNil(ServerAddress.normalized("http://reader.example.com"))
        XCTAssertNil(ServerAddress.normalized("https://user:password@reader.example.com"))
        XCTAssertNil(ServerAddress.normalized("reader.example.com"))
    }
}
