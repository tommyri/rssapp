import SwiftUI

/// The NetNewsWire timeline recipe, per design-ux.md: unread dot · title (bold when unread) ·
/// a one-to-two line snippet · a meta line · small triage markers. No thumbnails, ever —
/// their failure modes are a documented anti-pattern. Comfortable density only for now;
/// compact waits until the recipe has settled.
struct ArticleRow: View {
    let article: APIArticle
    /// A per-source list already names the source in its title, so its rows drop it from the
    /// meta line rather than repeating it fifty times.
    let showsFeedName: Bool

    /// The dot grows with the type it sits beside, so it stays a mark on the title rather than
    /// shrinking into a speck at accessibility sizes.
    @ScaledMetric(relativeTo: .headline) private var dotDiameter = 7
    @ScaledMetric(relativeTo: .headline) private var dotTopInset = 8

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(article.state.read ? Color.clear : BrandAccentInk.color)
                .frame(width: dotDiameter, height: dotDiameter)
                .padding(.top, dotTopInset)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 5) {
                Text(article.title)
                    .font(.headline)
                    .fontWeight(article.state.read ? .regular : .semibold)
                    .foregroundStyle(.primary)
                    .lineLimit(3)

                if let preview = article.preview, !preview.isEmpty {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                metaLine
            }
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityDescription)
        .modifier(SpokenPreview(preview: article.preview))
    }

    /// Absent entirely when there is nothing to say — a stub entry with no readable date and no
    /// estimate should not reserve a blank line.
    @ViewBuilder
    private var metaLine: some View {
        if !metaParts.isEmpty || hasMarkers {
            HStack(spacing: 5) {
                if !metaParts.isEmpty {
                    Text(metaText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if hasMarkers {
                    Spacer(minLength: 6)
                    if article.state.starred {
                        marker(StarIcon.starred, tint: StarIcon.tint)
                    }
                    if article.state.readLater {
                        marker(ReadLaterIcon.saved, tint: ReadLaterIcon.tint)
                    }
                }
            }
        }
    }

    private var hasMarkers: Bool {
        article.state.starred || article.state.readLater
    }

    private func marker(_ symbol: String, tint: Color) -> some View {
        Image(systemName: symbol)
            .font(.caption2)
            .foregroundStyle(tint)
            .accessibilityHidden(true)
    }

    private var metaText: String {
        metaParts.joined(separator: " · ")
    }

    /// The meta line and the spoken label draw from the same parts, so they cannot disagree
    /// about what a row says.
    private var metaParts: [String] {
        var parts: [String] = []
        if showsFeedName {
            parts.append(article.feed.title)
        }
        if let displayDate = article.displayDate {
            parts.append(displayDate)
        }
        if let readingTime = article.readingTimeLabel {
            parts.append(readingTime)
        }
        return parts
    }

    /// Reads as a sentence: state, then the title, then where and when it came from. The
    /// snippet is deliberately not in here — fifty rows of forty spoken words is not a
    /// scannable list — and rides along as custom content the reader can ask for instead.
    private var accessibilityDescription: String {
        var parts = [article.state.read ? "Read" : "Unread", article.title]
        parts.append(contentsOf: metaParts)
        if article.state.starred {
            parts.append("Starred")
        }
        if article.state.readLater {
            parts.append("In Read Later")
        }
        return parts.joined(separator: ", ")
    }
}

/// The snippet as accessibility *custom content*: VoiceOver reads it only when the reader asks
/// for more, so scanning fifty rows stays as fast as it looks, and nothing visible is hidden
/// from the accessibility tree either.
private struct SpokenPreview: ViewModifier {
    let preview: String?

    func body(content: Content) -> some View {
        if let preview, !preview.isEmpty {
            content.accessibilityCustomContent(
                Text("Preview"),
                Text(preview),
                importance: .default
            )
        } else {
            content
        }
    }
}

#Preview("Row states") {
    List {
        ArticleRow(article: .fixture, showsFeedName: true)
        ArticleRow(article: .readFixture, showsFeedName: true)
        ArticleRow(article: .starredFixture, showsFeedName: true)
        ArticleRow(article: .readLaterFixture, showsFeedName: true)
        ArticleRow(article: .sparseFixture, showsFeedName: true)
        ArticleRow(article: .fixture, showsFeedName: false)
    }
    .currentfoldCanvasRows()
    .listStyle(.plain)
    .currentfoldCanvas()
}
