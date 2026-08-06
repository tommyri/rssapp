import SwiftUI

/// How far through the copy the reader is — the article view's only new piece of chrome, and
/// it is not new chrome at all.
///
/// A `Divider()` already separated the header from the body on both reading screens. This
/// replaces it: the same line, in the same place, with the part already read painted in the
/// accent. So the screen gains an indicator without gaining a rule, which is the only way a
/// reading app should acquire one. It sits at the top edge of the thing it measures, and it is
/// still visible when the copy has scrolled the title away.
///
/// Two points rather than a hairline, because a hairline cannot show a fill; two points is
/// still quieter than any progress control the platform ships.
struct ReadingProgressBar: View {
    let progress: Double

    private var fraction: Double { ReadingProgressRule.clamp(progress) }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color(uiColor: .separator))
                Rectangle()
                    .fill(BrandAccentInk.color)
                    .frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: 2)
        .animation(.linear(duration: 0.12), value: fraction)
        .accessibilityElement()
        .accessibilityLabel("Reading progress")
        .accessibilityValue(
            Text(fraction.formatted(.percent.precision(.fractionLength(0))))
        )
    }
}

#Preview("Reading progress") {
    VStack(spacing: 28) {
        ReadingProgressBar(progress: 0)
        ReadingProgressBar(progress: 0.38)
        ReadingProgressBar(progress: 1)
    }
    .padding(.vertical, 40)
    .frame(maxHeight: .infinity, alignment: .top)
    .currentfoldCanvas()
}
