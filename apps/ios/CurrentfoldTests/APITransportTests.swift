import XCTest
@testable import Currentfold

final class APITransportTests: XCTestCase {
    func testWebLoginRedirectIsReportedAsAnOutdatedService() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [LoginPageURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let credentialStore = KeychainCredentialStore()
        let transport = APITransport(
            session: session,
            credentials: SessionTokenCoordinator(
                session: session,
                credentialStore: credentialStore
            )
        )

        do {
            let _: DataEnvelope<APIAuthProviders> = try await transport.send(
                baseURL: try XCTUnwrap(URL(string: "https://currentfold.example")),
                path: "api/v1/auth/providers"
            )
            XCTFail("Expected an outdated-service error")
        } catch let error as CurrentfoldAPIError {
            XCTAssertEqual(error, .serviceUpdateRequired)
        }
    }
}

private final class LoginPageURLProtocol: URLProtocol, @unchecked Sendable {
    override static func canInit(with request: URLRequest) -> Bool { true }

    override static func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let loginURL = URL(string: "https://currentfold.example/login")!
        let response = HTTPURLResponse(
            url: loginURL,
            statusCode: 200,
            httpVersion: "HTTP/2",
            headerFields: ["content-type": "text/html; charset=utf-8"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("<html>Sign in</html>".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
