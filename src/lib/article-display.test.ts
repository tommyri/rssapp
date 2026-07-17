import { describe, expect, it } from "vitest";
import { hasExpandedArticleContent } from "./article-display";

describe("hasExpandedArticleContent", () => {
  it("shows an audio-only feed entry as a playable episode", () => {
    expect(
      hasExpandedArticleContent(null, "https://cdn.example.com/episode.mp3"),
    ).toBe(true);
  });

  it("does not render an empty non-audio feed entry as an article", () => {
    expect(hasExpandedArticleContent(null, null)).toBe(false);
  });
});
