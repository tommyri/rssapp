import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "./sanitize";

describe("sanitizeArticleHtml embeds", () => {
  it("stores trusted video frames as click-to-load links", () => {
    const html = sanitizeArticleHtml(
      '<iframe src="https://www.youtube.com/embed/abc123" allowfullscreen></iframe>',
    );

    expect(html).not.toContain("iframe");
    expect(html).toContain('data-deferred-embed="youtube"');
    expect(html).toContain("Load YouTube video");
  });

  it("drops untrusted iframe URLs", () => {
    const html = sanitizeArticleHtml(
      '<iframe src="https://example.com/embed/abc"></iframe>',
    );

    expect(html).not.toContain("example.com");
    expect(html).not.toContain("iframe");
  });

  it("stores Twitter post embeds as click-to-load links without its script", () => {
    const html = sanitizeArticleHtml(
      '<blockquote class="twitter-tweet"><p>Post text</p><a href="https://x.com/example/status/123456789">June 1, 2026</a></blockquote><script src="https://platform.twitter.com/widgets.js"></script>',
    );

    expect(html).not.toContain("blockquote");
    expect(html).not.toContain("script");
    expect(html).toContain('data-deferred-embed="tweet"');
    expect(html).toContain("Load X post");
  });
});
