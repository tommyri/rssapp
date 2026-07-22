import { describe, expect, it } from "vitest";
import type { RuleSpec } from "./engine";
import { rulePreviewMatches } from "./preview";

const rule: RuleSpec = {
  field: "title",
  matchType: "contains",
  pattern: "rss",
};

describe("rulePreviewMatches", () => {
  it("returns only matching articles without their HTML content", () => {
    const matches = rulePreviewMatches(rule, [
      {
        id: 1,
        title: "RSS readers worth trying",
        author: "Ada",
        contentHtml: "<p>private preview source</p>",
        feedTitle: "Feeds Weekly",
        publishedAt: new Date("2026-07-12T09:00:00.000Z"),
      },
      {
        id: 2,
        title: "A different article",
        author: null,
        contentHtml: null,
        feedTitle: "Feeds Weekly",
        publishedAt: null,
      },
    ]);

    expect(matches).toEqual([
      {
        id: 1,
        title: "RSS readers worth trying",
        author: "Ada",
        feedTitle: "Feeds Weekly",
        publishedAt: "2026-07-12T09:00:00.000Z",
      },
    ]);
  });
});
