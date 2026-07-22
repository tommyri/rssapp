import Foundation

enum ServerAddress {
    static func normalized(_ value: String) -> URL? {
        let candidate = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: candidate),
              let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased(),
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil
        else {
            return nil
        }

        let localHosts = ["localhost", "127.0.0.1", "::1"]
        guard scheme == "https" || (scheme == "http" && localHosts.contains(host)) else {
            return nil
        }

        components.scheme = scheme
        components.host = host
        while components.path.count > 1, components.path.hasSuffix("/") {
            components.path.removeLast()
        }
        return components.url
    }
}
