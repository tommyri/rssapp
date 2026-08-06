import SwiftUI

struct RegistrationView: View {
    let prefilledEmail: String
    let inviteToken: String?
    @Environment(SessionStore.self) private var session
    @State private var email: String
    @State private var password = ""
    @State private var passwordConfirmation = ""
    @State private var confirmationMessage: String?
    @State private var attemptedSubmit = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case email
        case password
        case confirmation
    }

    init(prefilledEmail: String, inviteToken: String? = nil) {
        self.prefilledEmail = prefilledEmail
        self.inviteToken = inviteToken
        _email = State(initialValue: prefilledEmail)
    }

    var body: some View {
        Group {
            if let confirmationMessage {
                ContentUnavailableView {
                    Label("Check Your Email", systemImage: "envelope.badge")
                } description: {
                    Text(confirmationMessage)
                } actions: {
                    Button("Send Another Email") {
                        Task {
                            if let message = await session.resendVerification(email: email) {
                                self.confirmationMessage = message
                            }
                        }
                    }
                    .disabled(session.isConnecting)
                }
                .currentfoldCanvas()
            } else {
                registrationForm
            }
        }
        .navigationTitle("Create Account")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            session.clearAuthError()
            focusedField = email.isEmpty ? .email : .password
        }
    }

    private var registrationForm: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }

                SecureField("Password", text: $password)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .confirmation }

                SecureField("Confirm password", text: $passwordConfirmation)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .confirmation)
                    .submitLabel(.go)
                    .onSubmit(createAccount)
            } footer: {
                Text("Use at least 8 characters. You’ll verify the address before signing in.")
            }
            .currentfoldRaisedRows()

            if attemptedSubmit, let validationMessage {
                Section {
                    Label(validationMessage, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                }
                .currentfoldRaisedRows()
            } else if let message = session.authErrorMessage {
                Section {
                    Label(message, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                }
                .currentfoldRaisedRows()
            }

            Section {
                Button(action: createAccount) {
                    HStack {
                        Spacer()
                        if session.isConnecting {
                            ProgressView()
                        } else {
                            Text("Create Account")
                        }
                        Spacer()
                    }
                }
                .disabled(
                    session.isConnecting ||
                        email.isEmpty || password.isEmpty || passwordConfirmation.isEmpty
                )
                .buttonStyle(.primaryAction)
                .controlSize(.large)
            }
            .listRowBackground(Color.clear)

            NativeProviderSignInSection(inviteToken: inviteToken)
        }
        .currentfoldCanvas()
        .task { await session.loadAuthProviders() }
    }

    private var validationMessage: String? {
        if email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Enter your email address."
        }
        if password.count < 8 { return "Password must be at least 8 characters." }
        if password != passwordConfirmation { return "Passwords do not match." }
        return nil
    }

    private func createAccount() {
        attemptedSubmit = true
        guard !session.isConnecting, validationMessage == nil else { return }
        focusedField = nil
        Task {
            confirmationMessage = await session.register(
                email: email,
                password: password,
                inviteToken: inviteToken
            )
        }
    }
}

struct PasswordRecoveryView: View {
    let prefilledEmail: String
    @Environment(SessionStore.self) private var session
    @State private var email: String
    @State private var confirmationMessage: String?
    @FocusState private var emailFocused: Bool

    init(prefilledEmail: String) {
        self.prefilledEmail = prefilledEmail
        _email = State(initialValue: prefilledEmail)
    }

    var body: some View {
        Group {
            if let confirmationMessage {
                ContentUnavailableView {
                    Label("Check Your Email", systemImage: "envelope.badge")
                } description: {
                    Text(confirmationMessage)
                }
                .currentfoldCanvas()
            } else {
                recoveryForm
            }
        }
        .navigationTitle("Reset Password")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            session.clearAuthError()
            emailFocused = email.isEmpty
        }
    }

    private var recoveryForm: some View {
        Form {
            Section {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($emailFocused)
                    .submitLabel(.send)
                    .onSubmit(requestReset)
            } footer: {
                Text("We’ll send a secure link if the address belongs to an account.")
            }
            .currentfoldRaisedRows()

            if let message = session.authErrorMessage {
                Section {
                    Label(message, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                }
                .currentfoldRaisedRows()
            }

            Section {
                Button("Send Reset Link", action: requestReset)
                    .frame(maxWidth: .infinity)
                    .disabled(session.isConnecting || email.isEmpty)
                    .buttonStyle(.primaryAction)
                    .controlSize(.large)
            }
            .listRowBackground(Color.clear)
        }
        .currentfoldCanvas()
    }

    private func requestReset() {
        guard !session.isConnecting, !email.isEmpty else { return }
        emailFocused = false
        Task {
            confirmationMessage = await session.requestPasswordReset(email: email)
        }
    }
}
