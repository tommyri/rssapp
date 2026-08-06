import SwiftUI

/// A saved page in the unified Read Later queue, drawn to ``ArticleRow``'s recipe so the two
/// halves of one queue scan as one list: the same dot, the same title weight, the same
/// two-line snippet slot, the same meta line.
///
/// Three things differ, and each one is a fact about the row rather than decoration. A link
/// marker opens the meta line, because a saved page came from a URL rather than a source the
/// reader follows. The meta line says *saved* and a time, because a saved page has a save
/// date and no publication date. And the snippet slot carries the extraction's state while
/// there is no copy to preview — "Fetching a readable copy…" rather than an empty line that
/// would read as a row with nothing in it.
struct SavedPageRow: View {
    let entry: SavedPageEntry

    @ScaledMetric(relativeTo: .headline) private var dotDiameter = 7
    @ScaledMetric(relativeTo: .headline) private var dotTopInset = 8
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(showsUnreadDot ? BrandAccentInk.color : Color.clear)
                .frame(width: dotDiameter, height: dotDiameter)
                .padding(.top, dotTopInset)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                Text(entry.page.title)
                    .font(.headline)
                    .fontWeight(entry.page.state.read || entry.isRemoved ? .regular : .semibold)
                    .foregroundStyle(entry.isRemoved ? AnyShapeStyle(BrandSecondaryInk.color) : AnyShapeStyle(.primary))
                    .lineLimit(3)

                secondLine

                metaLine
            }
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityDescription)
        .modifier(SpokenSnippet(snippet: entry.page.preview))
    }

    /// A removed row keeps its place but stops claiming to be unread — the dot is a call to
    /// read something, and there is nothing left to read.
    private var showsUnreadDot: Bool {
        !entry.page.state.read && !entry.isRemoved
    }

    /// The snippet slot, which says whatever is truest about this row right now.
    @ViewBuilder
    private var secondLine: some View {
        if let status = statusText {
            Text(status)
                .font(.subheadline)
                .foregroundStyle(BrandSecondaryInk.color)
                .lineLimit(2)
        } else if let preview = entry.page.preview, !preview.isEmpty {
            Text(preview)
                .font(.subheadline)
                .foregroundStyle(BrandSecondaryInk.color)
                .lineLimit(2)
        }
    }

    /// One string, used by the row and by VoiceOver, so they cannot describe the same page
    /// differently.
    private var statusText: String? {
        if entry.isRemoved {
            return "Removed from Read Later."
        }
        switch entry.copyState {
        case .fetching:
            return "Fetching a readable copy…"
        case .failed:
            return "Couldn’t fetch a readable copy."
        case .ready:
            return nil
        }
    }

    /// The marker rides *inside* the string rather than beside it in an `HStack`: once the
    /// line is allowed to wrap, a sibling image centres itself against three lines of text and
    /// the meta line stops looking like a line. As an attachment it simply leads the first
    /// word, the way it always did.
    private var metaLine: some View {
        (Text(Image(systemName: SavedPageIcon.marker)) + Text(" " + metaParts.joined(separator: " · ")))
            .font(.subheadline)
            .foregroundStyle(BrandSecondaryInk.color)
            // Matching ``ArticleRow``: one line to scan past, uncapped when one line would be
            // three words and an ellipsis.
            .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
    }

    private var metaParts: [String] {
        var parts = [entry.page.siteName]
        if let displayDate = entry.page.displayDate {
            parts.append("saved \(displayDate)")
        }
        if let readingTime = entry.page.readingTimeLabel {
            parts.append(readingTime)
        }
        return parts
    }

    /// Reads as a sentence: state, that it is a saved page, the title, then where and when it
    /// came from. "Saved page" is spoken because the link marker that carries it visually is
    /// hidden from VoiceOver.
    private var accessibilityDescription: String {
        var parts = [entry.page.state.read || entry.isRemoved ? "Read" : "Unread", "Saved page"]
        parts.append(entry.page.title)
        parts.append(contentsOf: metaParts)
        if let statusText {
            parts.append(statusText)
        }
        return parts.joined(separator: ", ")
    }
}

/// The snippet as accessibility *custom content*, matching ``ArticleRow``: VoiceOver reads it
/// only when the reader asks for more, so scanning the queue stays as fast as it looks.
private struct SpokenSnippet: ViewModifier {
    let snippet: String?

    func body(content: Content) -> some View {
        if let snippet, !snippet.isEmpty {
            content.accessibilityCustomContent(
                Text("Preview"),
                Text(snippet),
                importance: .default
            )
        } else {
            content
        }
    }
}

#Preview("Saved page rows") {
    List {
        SavedPageRow(entry: .readyFixture)
        SavedPageRow(entry: .pendingFixture)
        SavedPageRow(entry: .failedFixture)
        SavedPageRow(entry: .retryingFixture)
        SavedPageRow(entry: .removedFixture)
    }
    .currentfoldCanvasRows()
    .listStyle(.plain)
    .currentfoldCanvas()
}
