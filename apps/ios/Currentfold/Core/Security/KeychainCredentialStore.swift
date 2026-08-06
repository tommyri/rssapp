import Foundation
import Security

/// Where the device session lives, for both binaries that need it.
///
/// **Why there are two groups.** Before the share extension existed the session was written
/// with no `kSecAttrAccessGroup`, so it landed in the app's own application-identifier group —
/// a place a second binary cannot reach. "Save to Currentfold" has to reuse the sign-in the
/// reader already did, so the session now lives in a group both targets are entitled to
/// (`…reader.shared`, declared in both entitlement files).
///
/// **Nobody is signed out by that move.** A read looks in the shared group first, and only if
/// it finds nothing does it look in the app's own group — which both binaries also list, so
/// the extension can find an un-migrated session too, on a phone where the reader updated the
/// app and hit the share sheet before ever opening it. A hit there is copied into the shared
/// group and the original deleted, in that order: a failed copy leaves the session exactly
/// where it was rather than losing it, and a failed delete leaves a duplicate that the next
/// read simply prefers past. Sign-out clears both, so a leftover copy can never resurrect a
/// session the reader ended.
///
/// **A build with no entitlements has no groups at all.** `keychain-access-groups` only
/// reaches the binary through code signing, so a simulator build made with
/// `CODE_SIGNING_ALLOWED=NO` — the one `scripts/test.sh` produces — has none, and every
/// grouped query it makes comes back `errSecMissingEntitlement`. That is treated as "not
/// here" rather than as a failure, and the unqualified query at the end of the search order
/// is what such a build reads and writes: exactly what this file did before. Nothing is
/// shared in that build, because nothing can be.
actor KeychainCredentialStore {
    private let service = "com.currentfold.reader.native-session"
    private let account = "currentfold-session"

    /// The group the app and the share extension share. Must match `keychain-access-groups`
    /// in both `Currentfold.entitlements` and `CurrentfoldShare.entitlements`.
    private static let sharedGroupSuffix = "com.currentfold.reader.shared"

    /// The app's own application-identifier group: where a session written before the share
    /// extension existed still is, and the only reason this file has a migration path.
    private static let appGroupSuffix = "com.currentfold.reader"

    /// The team prefix, trailing dot included, as Xcode expands it into the built Info.plist —
    /// empty when there is no provisioning profile, which is also how `$(AppIdentifierPrefix)`
    /// expands inside the entitlement files. Empty is therefore not a special case: the group
    /// name is built the same way here as it is there, so the two always agree.
    private static let accessGroupPrefix: String = {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "AppIdentifierPrefix") as? String
        else {
            return ""
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // An unexpanded build setting is not a prefix.
        return trimmed.contains("$(") ? "" : trimmed
    }()

    private static var sharedAccessGroup: String { accessGroupPrefix + sharedGroupSuffix }

    private static var appAccessGroup: String { accessGroupPrefix + appGroupSuffix }

    /// Where a session may be, newest arrangement first. `nil` — no access group — is last
    /// and is what a build without entitlements falls back to.
    private static var searchOrder: [String?] {
        [sharedAccessGroup, appAccessGroup, nil]
    }

    func readSession() throws -> APISessionCredential? {
        for group in Self.searchOrder {
            guard let session = try readSession(in: group) else { continue }
            if group != Self.sharedAccessGroup {
                // Best effort: a session that could not be moved is still a valid session.
                try? migrateToSharedGroup(session, from: group)
            }
            return session
        }
        return nil
    }

    func saveSession(_ session: APISessionCredential) throws {
        do {
            try write(session, in: Self.sharedAccessGroup)
        } catch KeychainError.unusableAccessGroup {
            try write(session, in: nil)
        }
    }

    func deleteSession() throws {
        // Every place a session could be. Signing out has to clear the pre-migration copy
        // too, or the next read would find it and hand back a session the reader ended.
        for group in Self.searchOrder {
            try delete(in: group)
        }
    }

    /** Remove the internal-build app credential that predates native sign-in. */
    func deleteLegacyCredential() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.currentfold.reader.api-token",
            kSecAttrAccount as String: "currentfold-api",
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    // MARK: - One group at a time

    private func migrateToSharedGroup(
        _ session: APISessionCredential,
        from group: String?
    ) throws {
        try write(session, in: Self.sharedAccessGroup)
        try delete(in: group)
    }

    private func readSession(in accessGroup: String?) throws -> APISessionCredential? {
        var query = baseQuery(in: accessGroup)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound || status == errSecMissingEntitlement { return nil }
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

    private func write(_ session: APISessionCredential, in accessGroup: String?) throws {
        let data = try JSONEncoder().encode(session)
        let status = SecItemUpdate(
            baseQuery(in: accessGroup) as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if status == errSecItemNotFound {
            var item = baseQuery(in: accessGroup)
            item[kSecValueData as String] = data
            // After first unlock, so the share extension can read the session on a phone the
            // reader has unlocked once today; this device only, because a session is a device.
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let addStatus = SecItemAdd(item as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw Self.error(for: addStatus)
            }
            return
        }
        guard status == errSecSuccess else {
            throw Self.error(for: status)
        }
    }

    private func delete(in accessGroup: String?) throws {
        let status = SecItemDelete(baseQuery(in: accessGroup) as CFDictionary)
        guard status == errSecSuccess
            || status == errSecItemNotFound
            || status == errSecMissingEntitlement
        else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    private static func error(for status: OSStatus) -> KeychainError {
        status == errSecMissingEntitlement
            ? .unusableAccessGroup
            : .unexpectedStatus(status)
    }

    private func baseQuery(in accessGroup: String?) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }
}

private enum KeychainError: LocalizedError {
    case unexpectedStatus(OSStatus)
    case invalidCredential
    /// This build carries no `keychain-access-groups` entitlement, so it cannot name a group.
    /// Not an error the reader ever sees — the caller falls back to the ungrouped item.
    case unusableAccessGroup

    var errorDescription: String? {
        switch self {
        case .unexpectedStatus, .unusableAccessGroup:
            "The secure credential store is unavailable."
        case .invalidCredential:
            "The saved sign-in could not be read securely. Sign in again."
        }
    }
}
