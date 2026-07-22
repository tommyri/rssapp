import AuthenticationServices
import CryptoKit
import GoogleSignIn
import SwiftUI
import UIKit

struct NativeProviderSignInSection: View {
    let inviteToken: String?

    @Environment(SessionStore.self) private var session
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if offersProviderSignIn {
            Section("Or continue with") {
                if session.authProviders?.apple == true {
                    SignInWithAppleButton(
                        .continue,
                        onRequest: configureAppleRequest,
                        onCompletion: completeAppleSignIn
                    )
                    .signInWithAppleButtonStyle(
                        colorScheme == .dark ? .white : .black
                    )
                    .frame(height: 50)
                    .disabled(session.isConnecting || session.appleChallenge == nil)
                    .accessibilityHint("Uses your Apple ID to sign in to Currentfold")
                }

                if session.authProviders?.google == true,
                   GoogleNativeSignIn.isConfigured {
                    GoogleProviderButton {
                        Task { await signInWithGoogle() }
                    }
                    .frame(height: 50)
                    .disabled(session.isConnecting)
                }
            }
        }
    }

    private var offersProviderSignIn: Bool {
        session.authProviders?.apple == true ||
            (session.authProviders?.google == true && GoogleNativeSignIn.isConfigured)
    }

    private func configureAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        guard let challenge = session.appleChallenge else { return }
        request.requestedScopes = [.fullName, .email]
        request.nonce = challenge.sha256
    }

    private func completeAppleSignIn(
        _ result: Result<ASAuthorization, any Error>
    ) {
        Task {
            defer { Task { await session.refreshAppleChallenge() } }

            switch result {
            case let .success(authorization):
                guard
                    let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                    let tokenData = credential.identityToken,
                    let token = String(data: tokenData, encoding: .utf8),
                    let challenge = session.appleChallenge
                else {
                    session.reportAuthenticationError(
                        "Apple did not return a usable sign-in credential."
                    )
                    return
                }
                let displayName = credential.fullName.flatMap {
                    PersonNameComponentsFormatter().string(from: $0).nilIfEmpty
                }
                await session.signIn(
                    with: APIProviderSignIn(
                        provider: .apple,
                        identityToken: token,
                        challenge: challenge,
                        displayName: displayName,
                        deviceName: "Currentfold for iOS",
                        inviteToken: inviteToken
                    )
                )
            case let .failure(error):
                if (error as? ASAuthorizationError)?.code != .canceled {
                    session.reportAuthenticationError(error.localizedDescription)
                }
            }
        }
    }

    private func signInWithGoogle() async {
        do {
            let token = try await GoogleNativeSignIn.identityToken()
            await session.signIn(
                with: APIProviderSignIn(
                    provider: .google,
                    identityToken: token,
                    challenge: nil,
                    displayName: nil,
                    deviceName: "Currentfold for iOS",
                    inviteToken: inviteToken
                )
            )
        } catch is CancellationError {
            return
        } catch let error as GIDSignInError where error.code == .canceled {
            return
        } catch {
            session.reportAuthenticationError(error.localizedDescription)
        }
    }
}

private struct GoogleProviderButton: UIViewRepresentable {
    let action: @MainActor () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(action: action)
    }

    func makeUIView(context: Context) -> GIDSignInButton {
        let button = GIDSignInButton()
        button.style = .wide
        button.addTarget(
            context.coordinator,
            action: #selector(Coordinator.activate),
            for: .touchUpInside
        )
        return button
    }

    func updateUIView(_ uiView: GIDSignInButton, context: Context) {}

    @MainActor
    final class Coordinator: NSObject {
        private let action: @MainActor () -> Void

        init(action: @escaping @MainActor () -> Void) {
            self.action = action
        }

        @objc func activate() {
            action()
        }
    }
}

@MainActor
enum GoogleNativeSignIn {
    enum SignInError: LocalizedError {
        case notConfigured
        case noPresentationAnchor
        case missingIdentityToken

        var errorDescription: String? {
            switch self {
            case .notConfigured:
                "Google sign-in is not configured in this Currentfold build."
            case .noPresentationAnchor:
                "Currentfold could not open Google sign-in right now."
            case .missingIdentityToken:
                "Google did not return a usable sign-in credential."
            }
        }
    }

    static var isConfigured: Bool {
        AppConfiguration.googleClientID != nil &&
            AppConfiguration.googleServerClientID != nil
    }

    static func identityToken() async throws -> String {
        guard
            let clientID = AppConfiguration.googleClientID,
            let serverClientID = AppConfiguration.googleServerClientID
        else {
            throw SignInError.notConfigured
        }
        guard let presenter = presentationAnchor() else {
            throw SignInError.noPresentationAnchor
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: clientID,
            serverClientID: serverClientID
        )
        let result = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: presenter
        )
        guard let token = result.user.idToken?.tokenString else {
            throw SignInError.missingIdentityToken
        }
        return token
    }

    static func handle(_ url: URL) -> Bool {
        GIDSignIn.sharedInstance.handle(url)
    }

    static func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }

    private static func presentationAnchor() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap {
            $0 as? UIWindowScene
        }
        let window = scenes
            .flatMap(\.windows)
            .first(where: { $0.isKeyWindow })
        return visibleViewController(from: window?.rootViewController)
    }

    private static func visibleViewController(
        from root: UIViewController?
    ) -> UIViewController? {
        if let presented = root?.presentedViewController {
            return visibleViewController(from: presented)
        }
        if let navigation = root as? UINavigationController {
            return visibleViewController(from: navigation.visibleViewController)
        }
        if let tabs = root as? UITabBarController {
            return visibleViewController(from: tabs.selectedViewController)
        }
        return root
    }
}

private extension String {
    var sha256: String {
        SHA256.hash(data: Data(utf8)).map { String(format: "%02x", $0) }.joined()
    }

    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
