import articlePage from "@currentfold/api-contract/fixtures/article-page.json";
import { describe, expect, it } from "vitest";
import { apiArticleSummary } from "@/lib/api-v1-article-summary";

describe("apiArticleSummary", () => {
  it("previews the body and estimates its reading time", () => {
    const html = `<p>${"word ".repeat(240).trim()}</p>`;

    const { preview, readingTime } = apiArticleSummary(html, "A title");

    // 240 words at 225 wpm rounds up rather than promising less than it takes.
    expect(readingTime).toBe(2);
    expect(preview).not.toBeNull();
    expect(preview?.length).toBeLessThanOrEqual(221);
  });

  it("reports null instead of noise for a stub entry", () => {
    // The shape of an HN-style link post: nothing to preview, nothing to read.
    expect(apiArticleSummary("<p>Comments</p>", "Some link")).toEqual({
      preview: null,
      readingTime: null,
    });
    expect(apiArticleSummary(null, "Some link")).toEqual({
      preview: null,
      readingTime: null,
    });
  });

  it("never ends a preview mid-word", () => {
    const html = `<p>${"alpha bravo ".repeat(40).trim()}</p>`;

    const preview = apiArticleSummary(html, null).preview ?? "";

    expect(preview.endsWith("…")).toBe(true);
    expect(preview.replace(/…$/, "")).toMatch(/(alpha|bravo)$/);
  });

  it("strips the boilerplate the web list rows strip", () => {
    // A repeated publication date and the title again: both already on the row.
    const html =
      "<p>25th July 2026 — A calmer way to follow the web. The reader stays out of the way, with quiet chrome and generous whitespace.</p>";

    expect(
      apiArticleSummary(html, "A calmer way to follow the web").preview,
    ).toBe(
      "The reader stays out of the way, with quiet chrome and generous whitespace.",
    );
  });

  it("agrees with the published article-page fixture", () => {
    // The fixture is what native clients decode in their own tests, so it has to
    // be what this server would actually have sent for that body.
    for (const article of articlePage.data) {
      expect(apiArticleSummary(article.content.html, article.title)).toEqual({
        preview: article.preview,
        readingTime: article.readingTime,
      });
    }
  });
});
