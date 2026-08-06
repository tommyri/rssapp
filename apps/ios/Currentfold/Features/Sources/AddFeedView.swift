import SwiftUI

/// Add a source, on the phone. The screen that closes PLAN.md's "a tester's first session must
/// not require a second device".
///
/// One field and one button, because that is genuinely the whole interaction — the server does
/// the discovery. Everything else on this screen is one of the four answers, and each is a
/// resolved state rather than an error banner over the form: a picker to answer, a
/// confirmation naming the source, an "you already have it" with somewhere to go, or the
/// server's own reason a URL did not resolve.
struct AddFeedView: View {
    /// What the confirmation's prominent action does. The sheet does not know whether it was
    /// opened from Sources, where the new source can be pushed, or from an empty Library,
    /// where the only useful move is to load it.
    let onAdded: (APISubscription) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var model: AddFeedModel
    @FocusState private var isFieldFocused: Bool
    /// Adding a source is the second action in the app with a result worth confirming.
    @State private var addedCount = 0

    init(
        store: ReaderStore,
        stage: AddFeedModel.Stage = .entry,
        onAdded: @escaping (APISubscription) -> Void
    ) {
        self.onAdded = onAdded
        _model = State(initialValue: AddFeedModel(store: store, stage: stage))
    }

    var body: some View {
        NavigationStack {
            stage
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .currentfoldCanvas()
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
                .sensoryFeedback(.success, trigger: addedCount)
        }
    }

    private var title: String {
        switch model.stage {
        case .entry: "Add a Source"
        case .choosing: "Choose a Feed"
        case .added: "Added"
        case .alreadyFollowing: "Already Following"
        }
    }

    @ViewBuilder
    private var stage: some View {
        switch model.stage {
        case .entry:
            entryForm
        case let .choosing(candidates):
            candidatePicker(candidates)
        case let .added(subscription):
            added(subscription)
        case let .alreadyFollowing(subscription):
            alreadyFollowing(subscription)
        }
    }
}

// MARK: - Entry

private extension AddFeedView {
    var entryForm: some View {
        List {
            Section {
                TextField("example.com", text: $model.url)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($isFieldFocused)
                    .disabled(model.isResolving)
                    .onSubmit { submit() }
                    .accessibilityLabel("Site or feed address")
            } header: {
                Text("Address")
            } footer: {
                Text(
                    """
                    Paste a site, a feed address, or a YouTube channel — Currentfold finds \
                    the feed.
                    """
                )
            }
            .currentfoldRaisedRows()

            if let failure = model.failure {
                Section {
                    Label(failure, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .font(.subheadline)
                }
                .currentfoldRaisedRows()
            }

            Section {
                submitButton
                    .frame(maxWidth: .infinity)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .task {
            guard model.url.isEmpty else { return }
            isFieldFocused = true
        }
    }

    @ViewBuilder
    var submitButton: some View {
        if model.isResolving {
            HStack(spacing: 10) {
                ProgressView()
                Text("Looking for a feed…")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(minHeight: 44)
        } else {
            Button("Find the Feed") { submit() }
                .buttonStyle(.primaryAction)
                .disabled(!model.canSubmit)
        }
    }

    func submit() {
        isFieldFocused = false
        Task { await model.submit() }
    }
}

// MARK: - The picker

private extension AddFeedView {
    /// The one thing the native path does that the web's form cannot: ask. Nothing has been
    /// subscribed yet, and the copy says so, because a list of feeds after tapping Add
    /// otherwise reads like a confirmation.
    func candidatePicker(_ candidates: [APIFeedCandidate]) -> some View {
        List {
            Section {
                ForEach(candidates) { candidate in
                    Button {
                        Task { await model.choose(candidate) }
                    } label: {
                        candidateRow(candidate)
                    }
                    .disabled(model.isResolving)
                }
            } header: {
                Text("Feeds on that page")
            } footer: {
                Text("Nothing is followed yet. Pick the one you want.")
            }
            .currentfoldRaisedRows()

            if let failure = model.failure {
                Section {
                    Label(failure, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                        .font(.subheadline)
                }
                .currentfoldRaisedRows()
            }

            Section {
                Button("Use a Different Address") { model.startOver() }
            }
            .currentfoldRaisedRows()
        }
        .listStyle(.insetGrouped)
    }

    /// `Color.primary`, not the hierarchical `.primary`: inside a button label the hierarchical
    /// styles resolve to the *tint*, which would paint all three rows coral and make a set of
    /// choices look like a set of links to somewhere else.
    func candidateRow(_ candidate: APIFeedCandidate) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(candidate.displayTitle)
                .font(.headline)
                .foregroundStyle(Color.primary)
            if let detail = candidate.displayDetail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Follows this feed.")
    }
}

// MARK: - Outcomes

private extension AddFeedView {
    func added(_ subscription: APISubscription) -> some View {
        ContentUnavailableView {
            Label("Now following \(subscription.title)", systemImage: "checkmark.circle")
        } description: {
            Text("Its articles are on the way into your Library.")
        } actions: {
            Button("Show Articles") {
                dismiss()
                onAdded(subscription)
            }
            .buttonStyle(.primaryAction)
            Button("Add Another") { model.startOver() }
        }
        .task { addedCount += 1 }
    }

    /// Not an error — the account has it, so the useful thing to offer is the way to it.
    func alreadyFollowing(_ subscription: APISubscription?) -> some View {
        ContentUnavailableView {
            Label("You already follow that", systemImage: ReadLaterIcon.saved)
        } description: {
            Text(
                subscription.map { "\($0.title) is already in your sources." }
                    ?? "That address resolves to a source this account already follows."
            )
        } actions: {
            if let subscription {
                Button("Show Articles") {
                    dismiss()
                    onAdded(subscription)
                }
                .buttonStyle(.primaryAction)
                Button("Add Another") { model.startOver() }
            } else {
                Button("Add Another") { model.startOver() }
                    .buttonStyle(.primaryAction)
            }
        }
    }
}

#Preview("Add a source") {
    AddFeedView(store: PreviewFixtures.readerStore(subscriptions: [.fixture])) { _ in }
}

#Preview("Choose a feed") {
    AddFeedView(
        store: PreviewFixtures.readerStore(subscriptions: [.fixture]),
        stage: .choosing([.postsFixture, .commentsFixture, .unlabelledFixture])
    ) { _ in }
}

#Preview("Added") {
    AddFeedView(
        store: PreviewFixtures.readerStore(subscriptions: [.fixture]),
        stage: .added(.fixture)
    ) { _ in }
}

#Preview("Already following") {
    AddFeedView(
        store: PreviewFixtures.readerStore(subscriptions: [.fixture]),
        stage: .alreadyFollowing(.fixture)
    ) { _ in }
}
