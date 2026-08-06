import Foundation
import Observation

/// What "Save to Currentfold" is doing, and the one sentence it will say about it.
///
/// Deliberately small: the extension has one job, four ways it can end, and no navigation.
/// Anything more would be a second app living inside a share sheet.
@MainActor
@Observable
final class SaveToCurrentfoldModel {
    enum Outcome: Equatable {
        case saving
        /// Saved. The copy is still being fetched — the contract answers before extraction,
        /// which is the whole reason a share sheet can dismiss this fast.
        case saved(String)
        /// The same URL was already in Read later. Nothing was re-fetched, and that is a
        /// success, not an error.
        case alreadySaved(String)
        /// `429`, carrying the server's own sentence about when to come back.
        case limited(String)
        case signedOut
        case nothingToSave
        case failed(String)
    }

    private(set) var outcome: Outcome = .saving

    /// Long enough for the reader to read four words, short enough that it never feels like a
    /// screen they have to dismiss. Success closes itself; every other ending waits, because
    /// a message that vanishes before it is read is the same as no message.
    static let successLinger = Duration.milliseconds(1100)

    private let apiClient: CurrentfoldAPIClient
    private let credentialStore: KeychainCredentialStore
    private let connection: CurrentfoldConnection

    init(
        apiClient: CurrentfoldAPIClient,
        credentialStore: KeychainCredentialStore,
        connection: CurrentfoldConnection
    ) {
        self.apiClient = apiClient
        self.credentialStore = credentialStore
        self.connection = connection
    }

    var isFinished: Bool {
        if case .saving = outcome { return false }
        return true
    }

    /// Returns once the outcome is decided. Whether the sheet then closes itself is the view's
    /// business, not the model's.
    func save(_ url: URL?) async {
        guard let url else {
            outcome = .nothingToSave
            return
        }
        // Asked before the request rather than inferred from a 401: a reader who is not
        // signed in should get an answer at share-sheet speed, not at network speed.
        guard await hasSession() else {
            outcome = .signedOut
            return
        }

        do {
            let result = try await apiClient.createSavedPage(connection, url)
            let name = Self.displayName(for: result.savedPage, fallback: url)
            outcome = result.alreadySaved ? .alreadySaved(name) : .saved(name)
        } catch let error as CurrentfoldAPIError {
            outcome = Self.outcome(for: error)
        } catch {
            outcome = .failed(error.localizedDescription)
        }
    }

    private func hasSession() async -> Bool {
        ((try? await credentialStore.readSession()) ?? nil) != nil
    }

    private static func outcome(for error: CurrentfoldAPIError) -> Outcome {
        switch error {
        case .sessionExpired:
            .signedOut
        case let .rejected(status, _, message) where status == 429:
            .limited(message)
        default:
            .failed(error.localizedDescription)
        }
    }

    /// The extracted title when there is one, and the host when there is not — which is the
    /// ordinary case, because the answer arrives before the copy does.
    private static func displayName(for page: APISavedPage, fallback: URL) -> String {
        if page.title != page.url.absoluteString, !page.title.isEmpty {
            return page.title
        }
        return page.siteName.isEmpty ? (fallback.host() ?? fallback.absoluteString) : page.siteName
    }
}

extension SaveToCurrentfoldModel {
    /// A model parked at one outcome. A preview cannot reach one any other way — the real
    /// route is a network answer — and this is a great deal less than a fake server.
    static func parked(at outcome: Outcome) -> SaveToCurrentfoldModel {
        let model = SaveToCurrentfoldModel(
            apiClient: ShareExtensionEnvironment.apiClient,
            credentialStore: ShareExtensionEnvironment.credentialStore,
            connection: ShareExtensionEnvironment.connection
        )
        model.outcome = outcome
        return model
    }
}
