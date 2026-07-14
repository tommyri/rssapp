// A highlight is anchored to the rendered article text, rather than the HTML
// tree. Sanitization and syntax highlighting can reshape markup, but the text
// offsets remain stable. If an article later changes, quote matching prevents a
// highlight from being applied to the wrong passage.

export const MAX_HIGHLIGHT_QUOTE_LENGTH = 1_000;
export const MAX_HIGHLIGHT_NOTE_LENGTH = 2_000;

export type HighlightTargetKind = "item" | "page";

export interface HighlightTarget {
  kind: HighlightTargetKind;
  id: number;
}

export interface HighlightAnchor {
  quote: string;
  startOffset: number;
  endOffset: number;
}

export interface ArticleHighlight extends HighlightAnchor {
  id: number;
  note: string | null;
}

/**
 * Applies local writes made after an asynchronous server read began. A read
 * response is a snapshot, so assigning it directly can otherwise erase a
 * highlight that the reader just created (or revive one they just deleted).
 */
export function reconcileHighlightSnapshot(
  snapshot: ArticleHighlight[],
  localChanges: ReadonlyMap<number, ArticleHighlight | null>,
): ArticleHighlight[] {
  const byId = new Map(snapshot.map((highlight) => [highlight.id, highlight]));
  for (const [id, highlight] of localChanges) {
    if (highlight) byId.set(id, highlight);
    else byId.delete(id);
  }
  return [...byId.values()].sort(
    (left, right) => left.startOffset - right.startOffset || left.id - right.id,
  );
}

/** Keeps a draft annotation visibly tied to its selected passage. */
export function visibleHighlights(
  highlights: ArticleHighlight[],
  pendingAnchor: HighlightAnchor | null,
): ArticleHighlight[] {
  return pendingAnchor
    ? [...highlights, { id: -1, ...pendingAnchor, note: null }]
    : highlights;
}

/** True only when an anchor still points at the exact stored quote. */
export function highlightMatchesText(
  text: string,
  highlight: HighlightAnchor,
): boolean {
  const { quote, startOffset, endOffset } = highlight;
  return (
    Number.isInteger(startOffset) &&
    Number.isInteger(endOffset) &&
    startOffset >= 0 &&
    endOffset > startOffset &&
    endOffset <= text.length &&
    endOffset - startOffset === quote.length &&
    text.slice(startOffset, endOffset) === quote
  );
}

/**
 * Filters stale anchors and returns valid annotations in a stable reading
 * order. Overlaps are intentional: the renderer turns their shared text into
 * a single segment carrying every relevant annotation ID.
 */
export function renderableHighlights(
  text: string,
  highlights: ArticleHighlight[],
): ArticleHighlight[] {
  return highlights
    .filter((highlight) => highlightMatchesText(text, highlight))
    .sort(
      (left, right) =>
        left.startOffset - right.startOffset ||
        right.endOffset - left.endOffset ||
        left.id - right.id,
    );
}
