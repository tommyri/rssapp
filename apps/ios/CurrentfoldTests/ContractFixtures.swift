import Foundation
import XCTest

/// Reading and comparing the shared `packages/api-contract/fixtures` files.
///
/// Shared by every contract test rather than repeated in each: the fixtures are one artifact,
/// and two copies of "how a fixture is compared" is exactly how one of them ends up comparing
/// something slightly different.
extension XCTestCase {
    func decodeFixture<Value: Decodable>(_ name: String) throws -> Value {
        let fixtureURL = try XCTUnwrap(
            Bundle(for: type(of: self)).url(forResource: name, withExtension: "json")
        )
        return try JSONDecoder().decode(Value.self, from: Data(contentsOf: fixtureURL))
    }

    /// Compares a request type's encoding to the shared fixture as JSON rather than as text, so
    /// key order and whitespace cannot fail a test that is otherwise correct.
    func assertEncoding<Value: Encodable>(
        _ value: Value,
        matches name: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) throws {
        let fixtureURL = try XCTUnwrap(
            Bundle(for: type(of: self)).url(forResource: name, withExtension: "json")
        )
        let fixture = try JSONSerialization.jsonObject(
            with: Data(contentsOf: fixtureURL)
        ) as? NSDictionary
        XCTAssertEqual(try encodedObject(value), fixture, name, file: file, line: line)
    }

    func encodedObject<Value: Encodable>(_ value: Value) throws -> NSDictionary? {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? NSDictionary
    }
}
