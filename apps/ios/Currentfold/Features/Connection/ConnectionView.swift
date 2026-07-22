import SwiftUI

struct ConnectionView: View {
    let isConnecting: Bool
    let errorMessage: String?
    let connect: @MainActor (String, String) async -> Void

    @State private var serverAddress = ""
    @State private var token = ""
    @Environment(CurrentfoldTheme.self) private var theme

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    BrandHeader()
                        .listRowInsets(EdgeInsets(top: 24, leading: 16, bottom: 20, trailing: 16))
                }

                Section {
                    TextField("https://reader.example.com", text: $serverAddress)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .accessibilityLabel("Server address")
                    SecureField("App credential", text: $token)
                        .textContentType(.password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Connect to your reader")
                } footer: {
                    Text(
                        """
                        For this development build, create a revocable app credential in \
                        Settings on the web app. Browser sign-in with PKCE will replace \
                        this step before external testing.
                        """
                    )
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.circle")
                            .foregroundStyle(.red)
                            .accessibilityLabel("Connection error: \(errorMessage)")
                    }
                }

                Section {
                    Button {
                        Task { await connect(serverAddress, token) }
                    } label: {
                        HStack {
                            Spacer()
                            if isConnecting {
                                ProgressView()
                            } else {
                                Text("Connect")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(isConnecting || serverAddress.isEmpty || token.isEmpty)
                    .buttonStyle(.borderedProminent)
                    .tint(theme.accent)
                }
                .listRowBackground(Color.clear)
            }
            .navigationTitle("Welcome")
        }
    }
}

#Preview("Connect") {
    ConnectionView(isConnecting: false, errorMessage: nil) { _, _ in }
        .environment(CurrentfoldTheme())
}

#Preview("Connection error") {
    ConnectionView(
        isConnecting: false,
        errorMessage: "That credential was not accepted."
    ) { _, _ in }
        .environment(CurrentfoldTheme())
}
