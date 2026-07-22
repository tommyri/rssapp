import SwiftUI

struct AuthenticationView: View {
    @Environment(SessionStore.self) private var session
    @Environment(CurrentfoldTheme.self) private var theme
    @State private var email = ""
    @State private var password = ""
    @State private var noticeMessage: String?
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email
        case password
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    BrandHeader()
                        .listRowInsets(
                            EdgeInsets(top: 28, leading: 16, bottom: 24, trailing: 16)
                        )
                }

                Section("Sign in") {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(signIn)
                }

                if let message = session.authErrorMessage {
                    Section {
                        Label(message, systemImage: "exclamationmark.circle")
                            .foregroundStyle(.red)
                            .accessibilityLabel("Sign-in error: \(message)")

                        if session.needsEmailVerification, !email.isEmpty {
                            Button("Send another verification email") {
                                Task {
                                    noticeMessage = await session.resendVerification(email: email)
                                }
                            }
                        }
                    }
                }

                if let noticeMessage {
                    Section {
                        Label(noticeMessage, systemImage: "envelope")
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button(action: signIn) {
                        HStack {
                            Spacer()
                            if session.isConnecting {
                                ProgressView()
                            } else {
                                Text("Sign In")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(session.isConnecting || email.isEmpty || password.isEmpty)
                    .buttonStyle(.borderedProminent)
                    .tint(theme.accent)
                }
                .listRowBackground(Color.clear)

                NativeProviderSignInSection(inviteToken: nil)

                Section {
                    NavigationLink("Create an Account") {
                        RegistrationView(prefilledEmail: email)
                    }
                    NavigationLink("Forgot Password?") {
                        PasswordRecoveryView(prefilledEmail: email)
                    }
                }
            }
            .navigationTitle("Welcome")
            .task { await session.loadAuthProviders() }
            .onChange(of: email) { _, _ in clearFeedback() }
            .onChange(of: password) { _, _ in clearFeedback() }
        }
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
