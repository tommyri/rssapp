import Foundation
import Observation

/// Following a source from a pasted URL, as a small state machine.
///
/// The endpoint has four answers and each one is a *different thing to say*, which is why this
/// is a stage rather than a success flag and an error string:
///
/// - **subscribed** — done. The reader is told which source they now follow, by name, because
///   what they pasted was often a site and what they got was its feed.
/// - **candidates** — a question, not a failure. The page advertised several feeds and nothing
///   was subscribed; answering means sending the chosen one back to the same endpoint. This is
///   the one behaviour the native path has that the web's add-a-feed form does not.
/// - **already following** — not an error either. The account has it, so the useful next move
///   is to go and read it, which needs the subscription the server did not send back; it is
///   found locally, by host, and only when exactly one source matches.
/// - **no feed found** — the only real failure, and the server's own message says what was
///   tried. It is shown verbatim rather than replaced with a generic line: "Could not fetch
///   page: HTTP 403" and "no feed advertised" are different problems for the reader.
@MainActor
@Observable
final class AddFeedModel {
    enum Stage: Equatable {
        case entry
        case choosing([APIFeedCandidate])
        case added(APISubscription)
        /// Carries the matching source when exactly one could be identified locally.
        case alreadyFollowing(APISubscription?)
    }

    var url = ""
    private(set) var stage: Stage = .entry
    private(set) var isResolving = false
    /// The server's own words, or the transport's. Never a stand-in for them.
    private(set) var failure: String?

    private let store: ReaderStore

    /// `stage` is settable so a preview can render an answer the network would otherwise have
    /// to produce. Nothing in the app passes it.
    init(store: ReaderStore, stage: Stage = .entry) {
        self.store = store
        self.stage = stage
    }

    var canSubmit: Bool {
        !isResolving && !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The stage as one spoken sentence.
    ///
    /// Three of the four answers replace the form in place and the fourth appears as a row
    /// under it; none of them moves VoiceOver's focus, so the sheet announces this instead
    /// (`announcesResult`). It lives on the model rather than in the view because it is the
    /// same four-way decision the view already renders, and a sentence nobody can see is
    /// exactly the kind of thing that rots quietly unless a test reads it.
    var spokenOutcome: String? {
        if let failure { return "Error: \(failure)" }
        switch stage {
        case .entry:
            return nil
        case let .choosing(candidates):
            return """
            \(candidates.count) feeds found. Nothing is followed yet — pick the one you want.
            """
        case let .added(subscription):
            return "Now following \(subscription.title)."
        case let .alreadyFollowing(subscription):
            return subscription.map { "You already follow \($0.title)." }
                ?? "You already follow that source."
        }
    }

    func submit() async {
        await resolve(url.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Answering the picker: the chosen candidate goes back to the same endpoint, exactly as
    /// the contract asks.
    func choose(_ candidate: APIFeedCandidate) async {
        await resolve(candidate.url.absoluteString)
    }

    /// Back to the field, keeping what was typed — a reader correcting a typo should not have
    /// to retype the address.
    func startOver() {
        stage = .entry
        failure = nil
    }

    private func resolve(_ address: String) async {
        guard !address.isEmpty, !isResolving else { return }
        isResolving = true
        failure = nil
        defer { isResolving = false }

        do {
            switch try await store.addSource(url: address) {
            case let .subscribed(subscription):
                stage = .added(subscription)
            case let .candidates(candidates):
                stage = .choosing(candidates)
            }
        } catch is CancellationError {
            return
        } catch let error as CurrentfoldAPIError {
            await report(error, for: address)
        } catch {
            failure = error.localizedDescription
        }
    }

    private func report(_ error: CurrentfoldAPIError, for address: String) async {
        guard case let .rejected(_, code, message) = error else {
            failure = error.errorDescription
            return
        }
        guard code == "already_subscribed" else {
            failure = message
            return
        }
        // The refusal does not name the source, and the list on hand may predate it, so ask
        // for a fresh one before trying to match.
        await store.loadSubscriptions()
        stage = .alreadyFollowing(existingSource(matching: address))
    }

    /// The one source whose feed or site is at the same host as what was pasted.
    ///
    /// Only when there is exactly one: an account following both a site's posts feed and its
    /// comments feed cannot be told from here which one the paste resolved to, and offering to
    /// open the wrong one is worse than offering nothing.
    private func existingSource(matching address: String) -> APISubscription? {
        guard let host = Self.host(of: address) else { return nil }
        let matches = store.subscriptions.filter { subscription in
            Self.host(of: subscription.feed.url.absoluteString) == host
                || subscription.feed.siteUrl.map { Self.host(of: $0.absoluteString) == host } == true
        }
        return matches.count == 1 ? matches.first : nil
    }

    /// The comparable part of an address. A scheme is assumed the way the server assumes one,
    /// and `www.` is dropped because a feed at `www.example.com` and a site at `example.com`
    /// are the same publisher.
    static func host(of address: String) -> String? {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let absolute = trimmed.contains("://") ? trimmed : "https://\(trimmed)"
        guard let host = URL(string: absolute)?.host()?.lowercased() else { return nil }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}
