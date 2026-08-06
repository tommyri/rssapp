import SwiftUI

struct AuthenticationView: View {
    @Environment(SessionStore.self) private var session
    @Environment(CurrentfoldTheme.self) private var theme
    @State private var email = ""
    @State private var password = ""
    @State private var noticeMessage: String?
    @State private var accountRoute: AccountRoute?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email
        case password
    }

    /// The two footer links push programmatically. A `NavigationLink` inside a form row
    /// draws a disclosure chevron and reads as another Settings row; the front door wants
    /// centered links under the primary action, so the push happens from a plain button.
    private enum AccountRoute: Hashable {
        case registration
        case passwordRecovery
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    BrandHeader(layout: .masthead)
                        .listRowInsets(
                            EdgeInsets(top: 36, leading: 20, bottom: 28, trailing: 20)
                        )
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)

                Section {
                    // A placeholder is not a name: it is the field's *value* to UIKit, so it
                    // stops being spoken the moment there is something typed, and VoiceOver
                    // then announces an unnamed text field. Every field on the front door
                    // carries its own label for that reason.
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }
                        .accessibilityLabel("Email")

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(signIn)
                        .accessibilityLabel("Password")
                }
                .currentfoldRaisedRows()

                if let message = session.authErrorMessage {
                    Section {
                        Label(message, systemImage: "exclamationmark.circle")
                            .foregroundStyle(BrandErrorInk.color)
                            .accessibilityLabel("Sign-in error: \(message)")

                        if session.needsEmailVerification, !email.isEmpty {
                            Button("Send another verification email") {
                                Task {
                                    noticeMessage = await session.resendVerification(email: email)
                                }
                            }
                        }
                    }
                    .currentfoldRaisedRows()
                }

                if let noticeMessage {
                    Section {
                        Label(noticeMessage, systemImage: "envelope")
                            .foregroundStyle(BrandSecondaryInk.color)
                    }
                    .currentfoldRaisedRows()
                }

                Section {
                    Button(action: signIn) {
                        ZStack {
                            Text("Sign In")
                                .opacity(session.isConnecting ? 0 : 1)
                            if session.isConnecting {
                                ProgressView()
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(session.isConnecting || email.isEmpty || password.isEmpty)
                    .buttonStyle(.primaryAction)
                    .controlSize(.large)
                    .accessibilityLabel("Sign In")
                }
                .listRowBackground(Color.clear)

                NativeProviderSignInSection(inviteToken: nil)

                Section {
                    footerLink("Create an Account", weight: .semibold) {
                        accountRoute = .registration
                    }
                    footerLink("Forgot Password?", weight: .regular) {
                        accountRoute = .passwordRecovery
                    }
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
            .currentfoldCanvas()
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $accountRoute) { route in
                switch route {
                case .registration:
                    RegistrationView(prefilledEmail: email)
                case .passwordRecovery:
                    PasswordRecoveryView(prefilledEmail: email)
                }
            }
            .task { await session.loadAuthProviders() }
            // A refusal appears as a new row halfway up a form; nothing moves focus to it.
            .announcesResult(session.authErrorMessage)
            .announcesResult(noticeMessage)
            .onChange(of: email) { _, _ in clearFeedback() }
            .onChange(of: password) { _, _ in clearFeedback() }
        }
    }

    private func footerLink(
        _ title: String,
        weight: Font.Weight,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(weight))
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 4)
        }
        .foregroundStyle(theme.accentInk)
    }

    private func signIn() {
        guard !session.isConnecting, !email.isEmpty, !password.isEmpty else { return }
        focusedField = nil
        Task { await session.signIn(email: email, password: password) }
    }

    private func clearFeedback() {
        noticeMessage = nil
        session.clearAuthError()
    }
}

#Preview("Sign in") {
    let credentials = KeychainCredentialStore()
    AuthenticationView()
        .environment(
            SessionStore(
                apiClient: PreviewFixtures.apiClient,
                credentialStore: credentials,
                serverURL: URL(string: "https://currentfold.example")!
            )
        )
        .environment(CurrentfoldTheme())
}
