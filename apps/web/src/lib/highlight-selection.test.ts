import { describe, expect, it } from "vitest";
import {
  type ArticleHighlight,
  highlightMatchesText,
  reconcileHighlightSnapshot,
  renderableHighlights,
  visibleHighlights,
} from "./highlight-selection";

const text = "A reader should preserve the exact selected passage.";

describe("highlightMatchesText", () => {
  it("accepts an exact text anchor", () => {
    expect(
      highlightMatchesText(text, {
        quote: "preserve",
        startOffset: 16,
        endOffset: 24,
      }),
    ).toBe(true);
  });

  it("rejects stale text and malformed ranges", () => {
    expect(
      highlightMatchesText(text, {
        quote: "changed",
        startOffset: 16,
        endOffset: 23,
      }),
    ).toBe(false);
    expect(
      highlightMatchesText(text, {
        quote: "reader",
        startOffset: 2,
        endOffset: 10,
      }),
    ).toBe(false);
  });
});

describe("renderableHighlights", () => {
  it("keeps valid non-overlapping anchors in reading order", () => {
    const highlights: ArticleHighlight[] = [
      { id: 2, quote: "passage", startOffset: 44, endOffset: 51, note: null },
      { id: 1, quote: "reader", startOffset: 2, endOffset: 8, note: "Useful." },
    ];

    expect(
      renderableHighlights(text, highlights).map((highlight) => highlight.id),
    ).toEqual([1, 2]);
  });

  it("keeps valid overlapping anchors while excluding stale ones", () => {
    const highlights: ArticleHighlight[] = [
      { id: 1, quote: "reader", startOffset: 2, endOffset: 8, note: null },
      {
        id: 2,
        quote: "reader should",
        startOffset: 2,
        endOffset: 15,
        note: null,
      },
      { id: 3, quote: "wrong", startOffset: 16, endOffset: 21, note: null },
    ];

    expect(
      renderableHighlights(text, highlights).map((highlight) => highlight.id),
    ).toEqual([2, 1]);
  });

  it("keeps a pending selection visibly highlighted while its note is composed", () => {
    const visible = visibleHighlights([], {
      quote: "reader",
      startOffset: 2,
      endOffset: 8,
    });

    expect(visible).toEqual([
      {
        id: -1,
        quote: "reader",
        startOffset: 2,
        endOffset: 8,
        note: null,
      },
    ]);
    expect(
      renderableHighlights(text, visible).map((highlight) => highlight.id),
    ).toEqual([-1]);
  });
});

describe("reconcileHighlightSnapshot", () => {
  it("retains a highlight created while an older empty load is in flight", () => {
    const saved: ArticleHighlight = {
      id: 7,
      quote: "reader",
      startOffset: 2,
      endOffset: 8,
      note: null,
    };

    expect(
      reconcileHighlightSnapshot([], new Map([[saved.id, saved]])),
    ).toEqual([saved]);
  });

  it("does not resurrect a highlight deleted while an older load is in flight", () => {
    const existing: ArticleHighlight = {
      id: 7,
      quote: "reader",
      startOffset: 2,
      endOffset: 8,
      note: null,
    };

    expect(
      reconcileHighlightSnapshot([existing], new Map([[existing.id, null]])),
    ).toEqual([]);
  });
});
