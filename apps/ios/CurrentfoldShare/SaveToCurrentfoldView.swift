import SwiftUI

/// The whole share extension, on one small card.
///
/// A share sheet is not a place to hold someone. Success dismisses itself and never gets a
/// button; the four endings that need a decision get exactly one. The surface is the app's
/// canvas — a saved link should land somewhere that looks like the reader it landed in — and
/// the one control is `.primaryAction`, which is the app's only prominent style.
struct SaveToCurrentfoldView: View {
    let model: SaveToCurrentfoldModel
    let close: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                symbol
                VStack(spacing: 6) {
                    Text(headline)
                        .font(.system(.title3, design: .serif, weight: .semibold))
                        .multilineTextAlignment(.center)
                        .accessibilityAddTraits(.isHeader)
                    if let detail {
                        // No line cap. The three endings that carry a sentence — the server's
                        // rate-limit message, "sign in first", a failure — are the whole point
                        // of stopping the sheet, and at an accessibility size three lines cut
                        // them in half. A card too small for the answer scrolls instead.
                        Text(detail)
                            .font(.subheadline)
                            .foregroundStyle(BrandSecondaryInk.color)
                            .multilineTextAlignment(.center)
                    }
                }

                if model.isFinished, dismissTitle != nil {
                    Button(dismissTitle ?? "Done", action: close)
                        .buttonStyle(.primaryAction)
                        .padding(.top, 4)
                }
            }
            .padding(32)
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .currentfoldCanvas()
        .accessibilityElement(children: .contain)
        .accessibilityLabel(spokenSummary)
        // A share sheet that answers and dismisses itself gives VoiceOver nothing to find, so
        // the answer is spoken as it lands.
        .announcesResult(model.isFinished ? spokenSummary : nil)
    }

    @ViewBuilder
    private var symbol: some View {
        switch model.outcome {
        case .saving:
            ProgressView()
                .controlSize(.large)
        case .saved:
            Image(systemName: ReadLaterIcon.saved)
                .font(.largeTitle)
                .foregroundStyle(BrandAccentInk.color)
        case .alreadySaved:
            Image(systemName: "checkmark.circle")
                .font(.largeTitle)
                .foregroundStyle(BrandAccentInk.color)
        case .limited, .signedOut, .nothingToSave, .failed:
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(BrandSecondaryInk.color)
        }
    }

    private var headline: String {
        switch model.outcome {
        case .saving: "Saving to Currentfold"
        case .saved: "Saved to Read Later"
        case .alreadySaved: "Already in Read Later"
        case .limited: "That’s a lot of links"
        case .signedOut: "Sign in first"
        case .nothingToSave: "Nothing to save"
        case .failed: "Couldn’t save that"
        }
    }

    private var detail: String? {
        switch model.outcome {
        case .saving:
            nil
        case let .saved(name):
            name
        case let .alreadySaved(name):
            name
        case let .limited(message):
            message
        case .signedOut:
            "Open Currentfold and sign in, then share this again."
        case .nothingToSave:
            "This didn’t come with a web address Currentfold can fetch."
        case let .failed(message):
            message
        }
    }

    /// Success has no button — it closes itself. Everything else does.
    private var dismissTitle: String? {
        switch model.outcome {
        case .saving, .saved, .alreadySaved: nil
        case .limited, .signedOut, .nothingToSave, .failed: "Done"
        }
    }

    private var spokenSummary: String {
        [headline, detail].compactMap(\.self).joined(separator: ". ")
    }
}

#Preview("Saving") {
    SaveToCurrentfoldView(model: .parked(at: .saving), close: {})
}

#Preview("Saved") {
    SaveToCurrentfoldView(model: .parked(at: .saved("The quiet web")), close: {})
}

#Preview("Limit reached") {
    SaveToCurrentfoldView(
        model: .parked(
            at: .limited("That’s a lot of links at once — try again in a few minutes.")
        ),
        close: {}
    )
}

#Preview("Signed out") {
    SaveToCurrentfoldView(model: .parked(at: .signedOut), close: {})
}
