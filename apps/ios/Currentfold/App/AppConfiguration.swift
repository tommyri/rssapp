import Foundation

enum AppConfiguration {
    static var serverURL: URL {
        if let configured = Bundle.main.object(forInfoDictionaryKey: "CurrentfoldServerURL") as? String,
           let url = ServerAddress.normalized(configured) {
            return url
        }

        #if DEBUG
        guard let localURL = URL(string: "http://localhost:3000") else {
            preconditionFailure("The built-in development URL is invalid.")
        }
        return localURL
        #else
        preconditionFailure("CurrentfoldServerURL must be configured for release builds.")
        #endif
    }

    static var googleClientID: String? {
        configuredValue(for: "CurrentfoldGoogleClientID")
    }

    static var googleServerClientID: String? {
        configuredValue(for: "CurrentfoldGoogleServerClientID")
    }

    private static func configuredValue(for key: String) -> String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
