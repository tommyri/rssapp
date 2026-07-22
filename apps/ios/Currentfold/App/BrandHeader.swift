import CurrentfoldBrand
import SwiftUI

struct BrandHeader: View {
    @Environment(CurrentfoldTheme.self) private var theme

    var body: some View {
        HStack(spacing: 12) {
            CurrentfoldAssets.mark
                .resizable()
                .scaledToFit()
                .frame(width: 42, height: 42)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("Currentfold")
                    .font(.system(.largeTitle, design: .serif, weight: .semibold))
                    .foregroundStyle(theme.primaryLabel)
                Text("Read the open web on your terms.")
                    .font(.subheadline)
                    .foregroundStyle(theme.secondaryLabel)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Currentfold. Read the open web on your terms.")
    }
}
