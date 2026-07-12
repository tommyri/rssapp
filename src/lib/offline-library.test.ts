import { describe, expect, it, vi } from "vitest";
import { offlineArticleFromReaderItem } from "./offline-library";

describe("offlineArticleFromReaderItem", () => {
  it("keeps only the safe reading payload under a user-scoped key", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T12:00:00.000Z"));

    const article = offlineArticleFromReaderItem(
      7,
      {
        kind: "item",
        id: 42,
        title: "Offline reading",
        url: "https://example.com/offline",
        author: "Ada",
        contentHtml: "<p>short copy</p>",
        fullContentHtml: null,
        publishedAt: new Date("2026-07-11T12:00:00.000Z"),
        sortTs: new Date("2026-07-11T12:00:00.000Z"),
        feedId: 3,
        feedTitle: "Example Feed",
        read: false,
        starred: false,
        readLater: false,
        readingProgress: null,
      },
      "<p>Sanitized readable copy</p>",
    );

    expect(article).toEqual({
      key: "7:item:42",
      userId: 7,
      kind: "item",
      itemId: 42,
      title: "Offline reading",
      url: "https://example.com/offline",
      author: "Ada",
      feedTitle: "Example Feed",
      publishedAt: "2026-07-11T12:00:00.000Z",
      savedAt: "2026-07-12T12:00:00.000Z",
      contentHtml: "<p>Sanitized readable copy</p>",
    });

    vi.useRealTimers();
  });
});
