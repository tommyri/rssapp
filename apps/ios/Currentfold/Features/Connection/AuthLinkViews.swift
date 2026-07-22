import SwiftUI

struct VerificationLinkView: View {
    let token: String
    @Environment(SessionStore.self) private var session
    @State private var message: String?
    @State private var didVerify = false

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label(
                    didVerify ? "Email Verified" : "Verifying Email",
                    systemImage: didVerify ? "checkmark.circle" : "envelope.badge"
                )
            } description: {
                if let message {
                    Text(message)
                } else if let error = session.authErrorMessage {
                    Text(error)
                } else {
                    ProgressView()
                }
            } actions: {
                if didVerify {
                    Button("Continue to Sign In") { session.dismissAuthLink() }
                        .buttonStyle(.borderedProminent)
                } else if session.authErrorMessage != nil {
                    Button("Close") { session.dismissAuthLink() }
                }
            }
            .task {
                guard message == nil, !didVerify else { return }
                if let result = await session.verifyEmail(token: token) {
                    message = result
                    didVerify = true
                }
            }
            .navigationTitle("Account Verification")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct PasswordResetLinkView: View {
    let token: String
    @Environment(SessionStore.self) private var session
    @Environment(CurrentfoldTheme.self) private var theme
    @State private var password = ""
    @State private var confirmation = ""
    @State private var successMessage: String?
    @State private var attemptedSubmit = false
    @FocusState private var passwordFocused: Bool

    var body: some View {
        NavigationStack {
            if let successMessage {
                ContentUnavailableView {
                    Label("Password Updated", systemImage: "checkmark.circle")
                } description: {
                    Text(successMessage)
                } actions: {
                    Button("Continue to Sign In") { session.dismissAuthLink() }
                        .buttonStyle(.borderedProminent)
                }
                .navigationTitle("Reset Password")
            } else {
                passwordForm
            }
        }
    }

    private var passwordForm: some View {
        Form {
            Section {
                SecureField("New password", text: $password)
                    .textContentType(.newPassword)
                    .focused($passwordFocused)
                SecureField("Confirm new password", text: $confirmation)
                    .textContentType(.newPassword)
            } footer: {
                Text("Use at least 8 characters.")
            }

            if attemptedSubmit, let validationMessage {
                Section {
                    Label(validationMessage, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                }
            } else if let message = session.authErrorMessage {
                Section {
                    Label(message, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button("Update Password") {
                    attemptedSubmit = true
                    guard validationMessage == nil else { return }
                    Task {
                        successMessage = await session.resetPassword(
                            token: token,
                            password: password
                        )
                    }
                }
                .frame(maxWidth: .infinity)
                .fontWeight(.semibold)
                .disabled(session.isConnecting || password.isEmpty || confirmation.isEmpty)
                .buttonStyle(.borderedProminent)
                .tint(theme.accent)
            }
            .listRowBackground(Color.clear)
        }
        .navigationTitle("Reset Password")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { passwordFocused = true }
    }

    private var validationMessage: String? {
        if password.count < 8 { return "Password must be at least 8 characters." }
        if password != confirmation { return "Passwords do not match." }
        return nil
    }
}
