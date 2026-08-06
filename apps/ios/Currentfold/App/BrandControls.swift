import SwiftUI

// MARK: - Surfaces

extension View {
    /// Paints the app's own canvas behind a screen and clears the platform's.
    ///
    /// Every screen calls this. design-ux.md's dark band is only a design decision if it is
    /// everywhere — half of the app on `deepInk` and half on pure black reads as a rendering
    /// bug, not a choice.
    func currentfoldCanvas() -> some View {
        modifier(CurrentfoldCanvas())
    }

    /// Rows of a grouped or inset list, which sit one step toward light so the cards keep
    /// their shape. `.scrollContentBackground(.hidden)` clears a list's background but not its
    /// cells', so a grouped list has to say this or its rows stay `secondarySystemGrouped`.
    func currentfoldRaisedRows() -> some View {
        listRowBackground(BrandSurface.raised)
    }

    /// Rows of a plain list, which sit directly on the canvas — there is no card to lift.
    func currentfoldCanvasRows() -> some View {
        listRowBackground(BrandSurface.canvas)
    }
}

private struct CurrentfoldCanvas: ViewModifier {
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(BrandSurface.canvas.ignoresSafeArea())
    }
}

// MARK: - Transient feedback

extension View {
    /// Speaks a result that the screen only *shows*.
    ///
    /// Three answers in this app arrive as a change of pixels rather than a change of screen:
    /// the mark-all-read receipt (a capsule that fades after two and a half seconds), the four
    /// endings of Add a Source, and a sign-in refusal that appears as a new row in a form. A
    /// VoiceOver reader has no reason to go looking for any of them, and the receipt is gone
    /// before they could. `AccessibilityNotification.Announcement` is how the platform says a
    /// thing out loud without moving focus, which matters here — focus is on the control that
    /// caused the result, and that is where it should stay.
    ///
    /// Posted on *change*, so re-rendering the same message does not repeat it.
    func announcesResult(_ message: String?) -> some View {
        modifier(AnnouncesResult(message: message))
    }
}

private struct AnnouncesResult: ViewModifier {
    let message: String?

    func body(content: Content) -> some View {
        content.onChange(of: message) { _, updated in
            guard let updated, !updated.isEmpty else { return }
            AccessibilityNotification.Announcement(updated).post()
        }
    }
}

// MARK: - The prominent call to action

extension ButtonStyle where Self == PrimaryActionButtonStyle {
    /// The one prominent control treatment in the app — see ``BrandCTA`` for the fill and
    /// label decision. Everything that used `.borderedProminent` uses this instead, because
    /// the previous arrangement (system style + `.tint(coral)`) put a white label on
    /// full-chroma coral at 2.9:1 and there is no per-screen fix for that.
    static var primaryAction: PrimaryActionButtonStyle { PrimaryActionButtonStyle() }
}

/// A hand-rolled prominent style rather than `.borderedProminent` with a tint, because the
/// system style picks the label color itself and will keep picking white. Fill and label have
/// to be decided together to be measurable, and `PrimaryActionContrastTests` measures them.
///
/// Metrics track the system's: `.large` matches a large bordered button, everything else lands
/// at the 44pt minimum hit target rather than the system's 34.
struct PrimaryActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        Surface(configuration: configuration)
    }

    private struct Surface: View {
        let configuration: Configuration

        @Environment(\.isEnabled) private var isEnabled
        @Environment(\.controlSize) private var controlSize

        var body: some View {
            configuration.label
                .font(font.weight(.semibold))
                .foregroundStyle(BrandCTA.label)
                .tint(BrandCTA.label)
                .padding(.vertical, verticalPadding)
                .padding(.horizontal, horizontalPadding)
                .frame(minHeight: minimumHeight)
                .background(
                    BrandCTA.fill,
                    in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                )
                .opacity(opacity)
                .contentShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
        }

        private var isLarge: Bool { controlSize == .large || controlSize == .extraLarge }

        private var font: Font { isLarge ? .body : .subheadline }
        private var verticalPadding: CGFloat { isLarge ? 13 : 9 }
        private var horizontalPadding: CGFloat { isLarge ? 22 : 18 }
        private var minimumHeight: CGFloat { isLarge ? 50 : 44 }
        private var cornerRadius: CGFloat { isLarge ? 14 : 12 }

        /// Dim on press the way a filled system control does, and fade when disabled — WCAG
        /// exempts inactive controls from the contrast floor, and a disabled button that still
        /// looks live is the worse failure.
        private var opacity: Double {
            guard isEnabled else { return 0.4 }
            return configuration.isPressed ? 0.82 : 1
        }
    }
}

#Preview("Primary action") {
    VStack(spacing: 20) {
        Button("Sign In") {}
            .frame(maxWidth: .infinity)
            .buttonStyle(.primaryAction)
            .controlSize(.large)

        Button("Show All Articles") {}
            .buttonStyle(.primaryAction)

        Button("Send Reset Link") {}
            .buttonStyle(.primaryAction)
            .disabled(true)
    }
    .padding(32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .currentfoldCanvas()
}
