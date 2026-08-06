import SwiftUI

/// **Aa**, in the reading toolbar — Safari Reader's control, in Safari Reader's place.
///
/// It sits at the leading end of the trailing group, so the two triage verbs keep the
/// rightmost, thumb-nearest slots: read state is changed constantly and text size is changed
/// once. A popover rather than a menu, because typography is adjusted by *comparing* — pick a
/// size, look at it, widen the column — and a menu closes on every selection.
struct ReadingTypographyButton: View {
    @State private var isPresented = false

    var body: some View {
        Button {
            isPresented = true
        } label: {
            Label("Reading Text", systemImage: "textformat.size")
        }
        .popover(isPresented: $isPresented) {
            ReadingTypographyControls()
                .padding(.horizontal, 18)
                .padding(.vertical, 20)
                .frame(idealWidth: 320)
                .presentationCompactAdaptation(.popover)
                .currentfoldCanvas()
        }
    }
}

/// The three choices, as segmented controls. Used by the toolbar popover; Settings shows the
/// same three preferences as list rows, and both write ``ReadingSettings`` — there is one copy
/// of the preference, so the two surfaces cannot drift.
struct ReadingTypographyControls: View {
    @Environment(ReadingSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings

        VStack(alignment: .leading, spacing: 16) {
            picker("Text Size", selection: $settings.typography.size, options: ReadingTextSize.allCases)
            picker("Font", selection: $settings.typography.font, options: ReadingBodyFont.allCases)
            picker(
                "Column Width",
                selection: $settings.typography.width,
                options: ReadingColumnWidth.allCases
            )
            Text("Applies to this iPhone. Article text still follows your system text size.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Segmented, with the label above rather than beside it: three options at an
    /// accessibility text size do not fit next to a label, and a wrapped segmented control is
    /// worse than a stacked one.
    private func picker<Option: ReadingTypographyOption>(
        _ title: String,
        selection: Binding<Option>,
        options: [Option]
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Picker(title, selection: selection) {
                ForEach(options) { option in
                    Text(option.title).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
    }
}

/// What the shared control needs of a typography choice. The three enums already have all of
/// it; this only says so once.
protocol ReadingTypographyOption: Hashable, Identifiable, CaseIterable {
    var title: String { get }
}

extension ReadingTextSize: ReadingTypographyOption {}
extension ReadingBodyFont: ReadingTypographyOption {}
extension ReadingColumnWidth: ReadingTypographyOption {}

#Preview("Reading controls") {
    ReadingTypographyControls()
        .padding()
        .frame(maxHeight: .infinity, alignment: .top)
        .currentfoldCanvas()
        .environment(ReadingSettings.ephemeral())
}
