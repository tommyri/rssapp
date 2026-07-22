import { describe, expect, it, vi } from "vitest";
import {
  automaticOfflineReconciliationPlan,
  type OfflineArticle,
  type OfflineMutation,
  offlineArticleFromReaderItem,
  offlineArticlesFromReaderItems,
  offlineDataClearPlan,
  offlineMutationForSavedLink,
  offlineMutationFromArticle,
  parseOfflineReadLaterAutoDownloadLimit,
} from "./offline-library";

function offlineArticle(
  id: number,
  source: OfflineArticle["source"],
): OfflineArticle {
  return {
    key: `7:item:${id}`,
    userId: 7,
    kind: "item",
    itemId: id,
    title: `Article ${id}`,
    url: null,
    author: null,
    feedTitle: null,
    publishedAt: null,
    savedAt: "2026-07-12T12:00:00.000Z",
    contentHtml: `<p>${id}</p>`,
    source,
  };
}

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
      source: "manual",
      read: false,
      starred: false,
      readLater: false,
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

describe("parseOfflineReadLaterAutoDownloadLimit", () => {
  it("accepts the bounded automatic-download options and disables unknown values", () => {
    expect(parseOfflineReadLaterAutoDownloadLimit(null)).toBe(0);
    expect(parseOfflineReadLaterAutoDownloadLimit("25")).toBe(25);
    expect(parseOfflineReadLaterAutoDownloadLimit("50")).toBe(50);
    expect(parseOfflineReadLaterAutoDownloadLimit("100")).toBe(100);
    expect(parseOfflineReadLaterAutoDownloadLimit("500")).toBe(0);
  });
});

describe("automaticOfflineReconciliationPlan", () => {
  it("keeps a new automatic copy eligible for the next bounded refresh", () => {
    const plan = automaticOfflineReconciliationPlan(
      7,
      [],
      [offlineArticle(1, "automatic")],
    );

    expect(plan.articles).toMatchObject([
      { key: "7:item:1", source: "automatic" },
    ]);
  });

  it("removes stale automatic copies without replacing manually kept articles", () => {
    const plan = automaticOfflineReconciliationPlan(
      7,
      [
        { ...offlineArticle(1, "manual"), read: true },
        offlineArticle(2, "automatic"),
        offlineArticle(3, "automatic"),
      ],
      [offlineArticle(1, "automatic"), offlineArticle(2, "automatic")],
    );

    expect(plan.staleKeys).toEqual(["7:item:3"]);
    expect(plan.articles).toMatchObject([
      { key: "7:item:1", source: "manual", read: true },
      { key: "7:item:2", source: "automatic" },
    ]);
  });
});

describe("offlineMutationFromArticle", () => {
  it("coalesces a reader field under a user-scoped mutation key", () => {
    const mutation = offlineMutationFromArticle(
      offlineArticle(42, "manual"),
      "starred",
      true,
    );

    expect(mutation).toMatchObject({
      key: "7:item:42:starred",
      userId: 7,
      kind: "item",
      itemId: 42,
      field: "starred",
      value: true,
    });
    expect(mutation.token).toEqual(expect.any(String));
  });

  it("only allows read changes for saved pages", () => {
    expect(() =>
      offlineMutationFromArticle(offlineArticle(7, "manual"), "starred", true),
    ).not.toThrow();
    expect(() =>
      offlineMutationFromArticle(
        { ...offlineArticle(8, "manual"), kind: "page" },
        "starred",
        true,
      ),
    ).toThrow("Saved pages only support read-state sync.");
  });
});

describe("offlineMutationForSavedLink", () => {
  it("uses the canonical URL with a unique, user-scoped mutation key", () => {
    const mutation = offlineMutationForSavedLink(
      7,
      "Example.com/article?utm_source=newsletter#section",
    );

    expect(mutation).toMatchObject({
      userId: 7,
      kind: "save-link",
      url: "https://example.com/article",
    });
    expect(mutation.key).toMatch(/^7:save-link:/);
    expect(mutation.token).toEqual(expect.any(String));
  });

  it("rejects non-web URLs before they reach the device queue", () => {
    expect(() =>
      offlineMutationForSavedLink(7, "mailto:reader@example.com"),
    ).toThrow("Enter a valid web address.");
  });
});

describe("offlineDataClearPlan", () => {
  it("only clears the selected user's local copies and pending mutations", () => {
    const mutation: OfflineMutation = {
      key: "7:item:1:read",
      userId: 7,
      kind: "item",
      itemId: 1,
      field: "read",
      value: true,
      token: "one",
      queuedAt: "2026-07-12T12:00:00.000Z",
    };

    expect(
      offlineDataClearPlan(
        7,
        [
          offlineArticle(1, "manual"),
          { ...offlineArticle(2, "manual"), userId: 8 },
        ],
        [mutation, { ...mutation, key: "8:item:1:read", userId: 8 }],
      ),
    ).toEqual({
      articleKeys: ["7:item:1"],
      mutationKeys: ["7:item:1:read"],
    });
  });
});
