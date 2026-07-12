import { describe, expect, it, vi } from "vitest";
import {
  offlineArticleFromReaderItem,
  offlineArticlesFromReaderItems,
} from "./offline-library";

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

describe("offlineArticlesFromReaderItems", () => {
  it("prefers extracted content and skips entries without a readable body", () => {
    const items = [
      {
        kind: "item" as const,
        id: 1,
        title: "Extracted",
        url: null,
        author: null,
        contentHtml: "<p>feed copy</p>",
        fullContentHtml: "<p>full copy</p>",
        publishedAt: null,
        sortTs: new Date("2026-07-12T12:00:00.000Z"),
        feedId: 1,
        feedTitle: null,
        read: false,
        starred: false,
        readLater: true,
        readingProgress: null,
      },
      {
        kind: "page" as const,
        id: 2,
        title: "Still extracting",
        url: null,
        author: null,
        contentHtml: null,
        fullContentHtml: null,
        publishedAt: null,
        sortTs: new Date("2026-07-12T11:00:00.000Z"),
        feedId: 0,
        feedTitle: null,
        read: false,
        starred: false,
        readLater: true,
        readingProgress: null,
      },
    ];

    expect(offlineArticlesFromReaderItems(7, items)).toHaveLength(1);
    expect(offlineArticlesFromReaderItems(7, items)[0]).toMatchObject({
      key: "7:item:1",
      contentHtml: "<p>full copy</p>",
    });
  });
});
