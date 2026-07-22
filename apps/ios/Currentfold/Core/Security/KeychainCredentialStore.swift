import Foundation
import Security

actor KeychainCredentialStore {
    private let service = "no.currentfold.reader.native-session"
    private let account = "currentfold-session"

    func readSession() throws -> APISessionCredential? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess,
              let data = result as? Data
        else {
            throw KeychainError.unexpectedStatus(status)
        }
        do {
            return try JSONDecoder().decode(APISessionCredential.self, from: data)
        } catch {
            throw KeychainError.invalidCredential
        }
    }

    func saveSession(_ session: APISessionCredential) throws {
        let data = try JSONEncoder().encode(session)
        let status = SecItemUpdate(
            baseQuery as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if status == errSecItemNotFound {
            var item = baseQuery
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let addStatus = SecItemAdd(item as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeychainError.unexpectedStatus(addStatus)
            }
            return
        }
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    func deleteSession() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    /** Remove the internal-build app credential that predates native sign-in. */
    func deleteLegacyCredential() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "no.currentfold.reader.api-token",
            kSecAttrAccount as String: "currentfold-api",
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

private enum KeychainError: LocalizedError {
    case unexpectedStatus(OSStatus)
    case invalidCredential

    var errorDescription: String? {
        switch self {
        case .unexpectedStatus:
            "The secure credential store is unavailable."
        case .invalidCredential:
            "The saved sign-in could not be read securely. Sign in again."
        }
    }
}
