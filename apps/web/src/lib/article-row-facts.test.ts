import { describe, expect, it } from "vitest";
import { articleRowFacts } from "./article-row-facts";
import type { ReaderItem } from "./reader";

const base: ReaderItem = {
  kind: "item",
  id: 1,
  title: "An article",
  url: "https://example.com/article",
  author: null,
  contentHtml: "<p>feed body</p>",
  fullContentHtml: null,
  publishedAt: null,
  sortTs: new Date("2026-07-25T12:00:00.000Z"),
  feedId: 3,
  feedTitle: "Example",
  read: false,
  starred: false,
  readLater: false,
  readingProgress: null,
  audioUrl: null,
  audioType: null,
  audioProgress: {},
};

const page = (patch: Partial<ReaderItem> = {}): ReaderItem => ({
  ...base,
  kind: "page",
  feedId: 0,
  pageStatus: "ready",
  pageError: null,
  ...patch,
});

describe("article row facts", () => {
  it("prefers extracted full text over the feed body", () => {
    expect(articleRowFacts(base).contentHtml).toBe("<p>feed body</p>");
    expect(
      articleRowFacts({ ...base, fullContentHtml: "<p>full</p>" }).contentHtml,
    ).toBe("<p>full</p>");
  });

  it("treats every non-terminal extraction state as still coming", () => {
    for (const status of ["pending", "processing", "retrying"] as const) {
      expect(
        articleRowFacts({ ...base, fullContentStatus: status }).fullTextPending,
      ).toBe(true);
    }
    expect(
      articleRowFacts({ ...base, fullContentStatus: "ready" }).fullTextPending,
    ).toBe(false);
  });

  it("reports a terminal extraction failure separately from a pending one", () => {
    const facts = articleRowFacts({
      ...base,
      fullContentStatus: "unavailable",
    });
    expect(facts).toMatchObject({
      fullTextPending: false,
      fullTextUnavailable: true,
    });
  });

  it("never reports feed full-text states for a saved page", () => {
    // A saved page has its own lifecycle in pageStatus and never carries
    // fullContentStatus, so reading it here would describe the wrong thing.
    const facts = articleRowFacts(
      page({ fullContentStatus: "pending" } as Partial<ReaderItem>),
    );
    expect(facts).toMatchObject({
      fullTextPending: false,
      fullTextUnavailable: false,
    });
  });

  it("subtitles a saved page only while it has something to report", () => {
    expect(articleRowFacts(page({ pageStatus: "pending" })).pageSubtitle).toBe(
      "Fetching a readable copy…",
    );
    expect(
      articleRowFacts(page({ pageStatus: "error" })).pageSubtitle,
    ).toContain("open the original");
    expect(articleRowFacts(page({ pageStatus: "ready" })).pageSubtitle).toBe(
      "",
    );
    expect(articleRowFacts(base).pageSubtitle).toBe("");
  });
});
