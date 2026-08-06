import CurrentfoldBrand
import SwiftUI

struct BrandHeader: View {
    /// `compact` is the leading-aligned lockup used where the brand accompanies something
    /// else (the launch spinner). `masthead` is the centered, larger front-door treatment:
    /// on the sign-in screen the brand *is* the title, so nothing above it repeats it.
    enum Layout {
        case compact
        case masthead
    }

    var layout: Layout = .compact
    @Environment(CurrentfoldTheme.self) private var theme

    var body: some View {
        content
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Currentfold. \(tagline)")
            .accessibilityAddTraits(.isHeader)
    }

    private var tagline: String { "Read the open web on your terms." }

    @ViewBuilder
    private var content: some View {
        switch layout {
        case .compact:
            HStack(spacing: 12) {
                mark(size: 42)

                VStack(alignment: .leading, spacing: 2) {
                    wordmark
                    taglineText
                }
            }
        case .masthead:
            VStack(spacing: 16) {
                mark(size: 64)

                VStack(spacing: 4) {
                    wordmark
                    taglineText
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func mark(size: CGFloat) -> some View {
        CurrentfoldAssets.mark
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    private var wordmark: some View {
        Text("Currentfold")
            .font(.system(.largeTitle, design: .serif, weight: .semibold))
            .foregroundStyle(theme.primaryLabel)
    }

    private var taglineText: some View {
        Text(tagline)
            .font(.subheadline)
            .foregroundStyle(theme.secondaryLabel)
    }
}

#Preview("Compact") {
    BrandHeader()
        .environment(CurrentfoldTheme())
}

#Preview("Masthead") {
    BrandHeader(layout: .masthead)
        .environment(CurrentfoldTheme())
}
