import { describe, expect, it } from "vitest";
import { deferEmbedsHtml, deferredEmbedFromUrl } from "./deferred-embeds";

describe("deferredEmbedFromUrl", () => {
  it("recognizes only HTTPS providers with embeddable URLs", () => {
    expect(
      deferredEmbedFromUrl("https://www.youtube.com/embed/abc123?rel=0"),
    ).toMatchObject({ provider: "youtube", label: "YouTube video" });
    expect(
      deferredEmbedFromUrl("https://player.vimeo.com/video/12345"),
    ).toMatchObject({ provider: "vimeo", label: "Vimeo video" });
    expect(
      deferredEmbedFromUrl("https://x.com/example/status/123456789"),
    ).toMatchObject({
      provider: "tweet",
      frameSrc:
        "https://platform.twitter.com/embed/Tweet.html?id=123456789&dnt=true",
    });
  });

  it("rejects lookalike, non-embedded, and insecure URLs", () => {
    expect(
      deferredEmbedFromUrl("https://www.youtube.com.evil.example/embed/abc"),
    ).toBeNull();
    expect(deferredEmbedFromUrl("https://www.youtube.com/watch?v=abc")).toBe(
      null,
    );
    expect(deferredEmbedFromUrl("http://www.youtube.com/embed/abc")).toBeNull();
  });
});

describe("deferEmbedsHtml", () => {
  it("turns stored iframe HTML into a lightweight activation link", () => {
    const html = deferEmbedsHtml(
      '<iframe src="https://www.youtube-nocookie.com/embed/abc?rel=0&amp;modestbranding=1"></iframe>',
    );

    expect(html).not.toContain("<iframe");
    expect(html).toContain('data-deferred-embed="youtube"');
    expect(html).toContain("Load YouTube video");
    expect(html).toContain("rel=0&amp;modestbranding=1");
  });

  it("turns marked Twitter blockquotes into click-to-load links", () => {
    const html = deferEmbedsHtml(
      '<blockquote data-deferred-embed="tweet"><p>Hello</p><a href="https://twitter.com/example/status/987654321">March 1, 2026</a></blockquote>',
    );

    expect(html).not.toContain("blockquote");
    expect(html).toContain('data-deferred-embed="tweet"');
    expect(html).toContain("Load X post");
  });

  it("drops unknown iframe sources instead of leaving a live frame", () => {
    expect(
      deferEmbedsHtml('<iframe src="https://example.com/embed/abc"></iframe>'),
    ).toBe("");
  });
});
