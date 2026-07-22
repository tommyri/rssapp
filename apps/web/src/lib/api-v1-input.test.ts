import { describe, expect, it } from "vitest";
import {
  decodeApiArticleCursor,
  encodeApiArticleCursor,
  parseApiArticleListQuery,
  parseApiReadStateBody,
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
          unreadOnly: "true",
          subscriptionId: "7",
          cursor,
        }),
      ),
    ).toEqual({
      limit: 25,
      unreadOnly: true,
      subscriptionId: 7,
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
});
