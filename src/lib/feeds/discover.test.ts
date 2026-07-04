import { describe, expect, it } from "vitest";
import { discoverFeedLinks, youtubeFeedUrl } from "./discover";

describe("youtubeFeedUrl", () => {
  it("resolves /channel/ URLs without needing HTML", () => {
    expect(
      youtubeFeedUrl(
        "https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA",
      ),
    ).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
    );
  });

  it("resolves playlist URLs", () => {
    expect(
      youtubeFeedUrl("https://www.youtube.com/playlist?list=PL123abc_-XYZ"),
    ).toBe(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=PL123abc_-XYZ",
    );
  });

  it("resolves legacy /user/ URLs", () => {
    expect(youtubeFeedUrl("https://youtube.com/user/somebody")).toBe(
      "https://www.youtube.com/feeds/videos.xml?user=somebody",
    );
  });

  it("resolves handle URLs from page HTML", () => {
    const html = '<script>var x = {"channelId":"UCabc123_-def"};</script>';
    expect(youtubeFeedUrl("https://www.youtube.com/@someone", html)).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123_-def",
    );
  });

  it("prefers the canonical link over other channels mentioned in the page", () => {
    const html =
      '{"channelId":"UCrelatedChannel1"}' +
      '<link rel="canonical" href="https://www.youtube.com/channel/UCtheRealOne">';
    expect(youtubeFeedUrl("https://www.youtube.com/@someone", html)).toBe(
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCtheRealOne",
    );
  });

  it("returns null for handle URLs without HTML", () => {
    expect(youtubeFeedUrl("https://www.youtube.com/@someone")).toBeNull();
  });

  it("ignores non-YouTube URLs", () => {
    expect(youtubeFeedUrl("https://example.com/channel/UC123")).toBeNull();
    expect(youtubeFeedUrl("not a url")).toBeNull();
  });
});

describe("discoverFeedLinks", () => {
  it("finds alternate links and resolves relative hrefs", () => {
    const html =
      '<head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head>';
    expect(discoverFeedLinks(html, "https://example.com/blog/")).toEqual([
      "https://example.com/feed.xml",
    ]);
  });

  it("ignores non-feed alternates", () => {
    const html =
      '<link rel="alternate" hreflang="en" href="/en"><link rel="stylesheet" href="/x.css">';
    expect(discoverFeedLinks(html, "https://example.com")).toEqual([]);
  });
});
