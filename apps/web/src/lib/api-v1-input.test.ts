import { describe, expect, it } from "vitest";
import {
  decodeApiArticleCursor,
  decodeApiSavedPageCursor,
  encodeApiArticleCursor,
  encodeApiSavedPageCursor,
  parseApiArticleListQuery,
  parseApiMarkAllReadBody,
  parseApiOpaqueId,
  parseApiReadingProgressBody,
  parseApiReadLaterStateBody,
  parseApiReadStateBody,
  parseApiSavedPageCreateBody,
  parseApiSavedPageListQuery,
  parseApiSavedPageReadingProgressBody,
  parseApiSavedPageReadStateBody,
  parseApiStarredStateBody,
  parseApiSubscriptionCreateBody,
} from "@/lib/api-v1-input";

describe("first-party API input", () => {
  it("round-trips an opaque, versioned article cursor", () => {
    const cursor = {
      sortAt: new Date("2026-07-22T12:00:00.000Z"),
      articleId: 42,
    };

    expect(decodeApiArticleCursor(encodeApiArticleCursor(cursor))).toEqual(
      cursor,
    );
    expect(decodeApiArticleCursor("not-a-cursor")).toBeNull();
  });

  it("parses bounded list filters and rejects invalid query values", () => {
    const cursor = encodeApiArticleCursor({
      sortAt: new Date("2026-07-22T12:00:00.000Z"),
      articleId: 42,
    });
    expect(
      parseApiArticleListQuery(
        new URLSearchParams({
          limit: "25",
          filter: "starred",
          subscriptionId: "7",
          folderId: "3",
          cursor,
        }),
      ),
    ).toEqual({
      limit: 25,
      filter: "starred",
      subscriptionId: 7,
      folderId: 3,
      cursor: {
        sortAt: new Date("2026-07-22T12:00:00.000Z"),
        articleId: 42,
      },
    });
    expect(
      parseApiArticleListQuery(new URLSearchParams({ limit: "101" })),
    ).toBeNull();
    expect(
      parseApiArticleListQuery(
        new URLSearchParams({ unreadOnly: "sometimes" }),
      ),
    ).toBeNull();
    expect(
      parseApiArticleListQuery(new URLSearchParams({ filter: "unopened" })),
    ).toBeNull();
    expect(
      parseApiArticleListQuery(new URLSearchParams({ folderId: "0" })),
    ).toBeNull();
  });

  it("defaults to the whole unfiltered stream", () => {
    expect(parseApiArticleListQuery(new URLSearchParams())).toEqual({
      limit: 50,
      filter: "all",
      subscriptionId: null,
      folderId: null,
      cursor: null,
    });
  });

  it("keeps honouring unreadOnly but refuses to guess when it contradicts filter", () => {
    expect(
      parseApiArticleListQuery(new URLSearchParams({ unreadOnly: "true" }))
        ?.filter,
    ).toBe("unread");
    expect(
      parseApiArticleListQuery(new URLSearchParams({ unreadOnly: "false" }))
        ?.filter,
    ).toBe("all");
    // Compatible: unreadOnly=false only says "do not restrict to unread".
    expect(
      parseApiArticleListQuery(
        new URLSearchParams({ filter: "starred", unreadOnly: "false" }),
      )?.filter,
    ).toBe("starred");
    expect(
      parseApiArticleListQuery(
        new URLSearchParams({ filter: "starred", unreadOnly: "true" }),
      ),
    ).toBeNull();
    expect(
      parseApiArticleListQuery(
        new URLSearchParams({ filter: "unread", unreadOnly: "false" }),
      ),
    ).toBeNull();
  });

  it("accepts opaque string IDs and deduplicates an idempotent state batch", () => {
    expect(
      parseApiReadStateBody({
        articleIds: ["42", "42", "43"],
        read: true,
      }),
    ).toEqual({ articleIds: [42, 43], read: true });
    expect(parseApiReadStateBody({ articleIds: [42], read: true })).toBeNull();
    expect(parseApiReadStateBody({ articleIds: [], read: false })).toBeNull();
  });

  it("parses star and read-later batches on the same terms as read state", () => {
    expect(
      parseApiStarredStateBody({ articleIds: ["42", "42"], starred: true }),
    ).toEqual({ articleIds: [42], starred: true });
    expect(
      parseApiReadLaterStateBody({ articleIds: ["43"], readLater: false }),
    ).toEqual({ articleIds: [43], readLater: false });
    // The flag is not interchangeable: each endpoint sets exactly one state.
    expect(
      parseApiStarredStateBody({ articleIds: ["42"], read: true }),
    ).toBeNull();
    expect(
      parseApiReadLaterStateBody({ articleIds: ["42"], starred: true }),
    ).toBeNull();
    expect(
      parseApiStarredStateBody({
        articleIds: Array.from({ length: 101 }, (_, index) =>
          String(index + 1),
        ),
        starred: true,
      }),
    ).toBeNull();
  });

  it("requires a bulk read sweep to name exactly one scope", () => {
    expect(parseApiMarkAllReadBody({ scope: "all" })).toEqual({
      scope: "all",
      subscriptionId: null,
      folderId: null,
      olderThan: null,
    });
    expect(
      parseApiMarkAllReadBody({ scope: "subscription", subscriptionId: "7" }),
    ).toEqual({
      scope: "subscription",
      subscriptionId: 7,
      folderId: null,
      olderThan: null,
    });
    expect(parseApiMarkAllReadBody({ scope: "folder", folderId: "3" })).toEqual(
      {
        scope: "folder",
        subscriptionId: null,
        folderId: 3,
        olderThan: null,
      },
    );

    // An omitted scope must not fall back to sweeping the whole account.
    expect(parseApiMarkAllReadBody({})).toBeNull();
    expect(parseApiMarkAllReadBody({ subscriptionId: "7" })).toBeNull();
    expect(parseApiMarkAllReadBody({ scope: "subscription" })).toBeNull();
    expect(
      parseApiMarkAllReadBody({
        scope: "subscription",
        subscriptionId: "7",
        folderId: "3",
      }),
    ).toBeNull();
    expect(parseApiMarkAllReadBody({ scope: "everything" })).toBeNull();
  });

  it("takes an olderThan cutoff as an instant, not a local timestamp", () => {
    expect(
      parseApiMarkAllReadBody({
        scope: "all",
        olderThan: "2026-07-22T12:00:00.000Z",
      })?.olderThan,
    ).toEqual(new Date("2026-07-22T12:00:00.000Z"));
    expect(
      parseApiMarkAllReadBody({
        scope: "all",
        olderThan: "2026-07-22T14:00:00+02:00",
      })?.olderThan,
    ).toEqual(new Date("2026-07-22T12:00:00.000Z"));
    expect(
      parseApiMarkAllReadBody({ scope: "all", olderThan: "2026-07-22" }),
    ).toBeNull();
    expect(
      parseApiMarkAllReadBody({
        scope: "all",
        olderThan: "2026-07-22T12:00:00",
      }),
    ).toBeNull();
  });
});

describe("saved-page and reading-progress input", () => {
  it("round-trips an opaque saved-page cursor", () => {
    const cursor = {
      savedAt: new Date("2026-07-24T09:15:00.000Z"),
      savedPageId: 31,
    };

    expect(decodeApiSavedPageCursor(encodeApiSavedPageCursor(cursor))).toEqual(
      cursor,
    );
    expect(decodeApiSavedPageCursor("not-a-cursor")).toBeNull();
    expect(decodeApiSavedPageCursor("")).toBeNull();
  });

  it("refuses an article cursor on the saved-page stream, and the reverse", () => {
    // Two streams ordered by different columns. Silently restarting the page
    // would be worse than an error a client can see in development.
    const articleCursor = encodeApiArticleCursor({
      sortAt: new Date("2026-07-22T12:00:00.000Z"),
      articleId: 42,
    });
    const savedPageCursor = encodeApiSavedPageCursor({
      savedAt: new Date("2026-07-24T09:15:00.000Z"),
      savedPageId: 31,
    });

    expect(decodeApiSavedPageCursor(articleCursor)).toBeNull();
    expect(decodeApiArticleCursor(savedPageCursor)).toBeNull();
  });

  it("defaults the saved-page page size and rejects an unusable one", () => {
    expect(parseApiSavedPageListQuery(new URLSearchParams())).toEqual({
      limit: 50,
      cursor: null,
    });
    expect(
      parseApiSavedPageListQuery(new URLSearchParams("limit=101")),
    ).toBeNull();
    expect(
      parseApiSavedPageListQuery(new URLSearchParams("cursor=nonsense")),
    ).toBeNull();
  });

  it("takes a URL to save or subscribe to, trimmed and length-capped", () => {
    expect(
      parseApiSavedPageCreateBody({ url: "  https://example.org/essay  " }),
    ).toEqual({ url: "https://example.org/essay" });
    expect(parseApiSubscriptionCreateBody({ url: "example.com" })).toEqual({
      url: "example.com",
    });

    expect(parseApiSavedPageCreateBody({})).toBeNull();
    expect(parseApiSavedPageCreateBody({ url: "" })).toBeNull();
    expect(parseApiSavedPageCreateBody({ url: "  " })).toBeNull();
    expect(parseApiSavedPageCreateBody({ url: 7 })).toBeNull();
    expect(
      parseApiSavedPageCreateBody({
        url: `https://example.org/${"a".repeat(2048)}`,
      }),
    ).toBeNull();
    // Strict bodies: an unexpected key is a client bug worth reporting.
    expect(
      parseApiSubscriptionCreateBody({
        url: "https://example.com",
        folderId: "3",
      }),
    ).toBeNull();
  });

  it("reads an opaque id out of a path segment", () => {
    expect(parseApiOpaqueId("31")).toBe(31);
    expect(parseApiOpaqueId("0")).toBeNull();
    expect(parseApiOpaqueId("-1")).toBeNull();
    expect(parseApiOpaqueId("31abc")).toBeNull();
    expect(parseApiOpaqueId("")).toBeNull();
  });

  it("takes a batch of saved-page read states", () => {
    expect(
      parseApiSavedPageReadStateBody({
        savedPageIds: ["31", "31", "30"],
        read: true,
      }),
    ).toEqual({ savedPageIds: [31, 30], read: true });

    expect(
      parseApiSavedPageReadStateBody({ savedPageIds: [], read: true }),
    ).toBeNull();
    expect(
      parseApiSavedPageReadStateBody({ savedPageIds: ["31"], starred: true }),
    ).toBeNull();
  });

  it("takes reading positions but rejects two positions for one id", () => {
    expect(
      parseApiReadingProgressBody({
        positions: [
          { articleId: "42", readingProgress: 0.42 },
          { articleId: "43", readingProgress: null },
        ],
      }),
    ).toEqual({
      positions: [
        { articleId: 42, readingProgress: 0.42 },
        { articleId: 43, readingProgress: null },
      ],
    });

    // Two positions for one article contradict each other; last-write-wins
    // would silently keep whichever the client happened to serialize second.
    expect(
      parseApiReadingProgressBody({
        positions: [
          { articleId: "42", readingProgress: 0.42 },
          { articleId: "42", readingProgress: 0.9 },
        ],
      }),
    ).toBeNull();

    expect(parseApiReadingProgressBody({ positions: [] })).toBeNull();
    expect(
      parseApiReadingProgressBody({
        positions: [{ articleId: "42", readingProgress: 1.5 }],
      }),
    ).toBeNull();
    expect(
      parseApiReadingProgressBody({
        positions: [{ articleId: "42", readingProgress: -0.1 }],
      }),
    ).toBeNull();
    expect(
      parseApiReadingProgressBody({
        positions: [{ articleId: "42" }],
      }),
    ).toBeNull();
  });

  it("takes saved-page reading positions under the same rules", () => {
    expect(
      parseApiSavedPageReadingProgressBody({
        positions: [{ savedPageId: "31", readingProgress: 0 }],
      }),
    ).toEqual({ positions: [{ savedPageId: 31, readingProgress: 0 }] });

    expect(
      parseApiSavedPageReadingProgressBody({
        positions: [
          { savedPageId: "31", readingProgress: 0.1 },
          { savedPageId: "31", readingProgress: 0.2 },
        ],
      }),
    ).toBeNull();
    expect(
      parseApiSavedPageReadingProgressBody({
        positions: [{ articleId: "31", readingProgress: 0.1 }],
      }),
    ).toBeNull();
  });
});
