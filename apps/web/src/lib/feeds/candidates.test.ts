import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchFeedUrl: vi.fn() }));

vi.mock("./fetch", () => ({ fetchFeedUrl: mocks.fetchFeedUrl }));

import { discoverFeedCandidates } from "./candidates";

const FEED_XML = '<?xml version="1.0"?><rss version="2.0"><channel/></rss>';

function feedBody() {
  return {
    status: "ok" as const,
    body: FEED_XML,
    contentType: "application/rss+xml",
    etag: null,
    lastModified: null,
  };
}

function htmlBody(body: string) {
  return {
    status: "ok" as const,
    body,
    contentType: "text/html; charset=utf-8",
    etag: null,
    lastModified: null,
  };
}

function notFound() {
  return { status: "error" as const, httpStatus: 404, error: "HTTP 404" };
}

describe("discoverFeedCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes a URL that already answers with a feed", async () => {
    mocks.fetchFeedUrl.mockResolvedValue(feedBody());

    await expect(
      discoverFeedCandidates("https://example.com/feed.xml"),
    ).resolves.toEqual({
      status: "feed",
      feedUrl: "https://example.com/feed.xml",
    });
    expect(mocks.fetchFeedUrl).toHaveBeenCalledTimes(1);
  });

  it("adds a scheme to a bare host before fetching anything", async () => {
    mocks.fetchFeedUrl.mockResolvedValue(feedBody());

    await expect(discoverFeedCandidates("example.com/feed")).resolves.toEqual({
      status: "feed",
      feedUrl: "https://example.com/feed",
    });
    expect(mocks.fetchFeedUrl).toHaveBeenCalledWith("https://example.com/feed");
  });

  it("takes the single feed a page advertises", async () => {
    mocks.fetchFeedUrl.mockImplementation(async (url: string) =>
      url === "https://example.com/"
        ? htmlBody(
            '<link rel="alternate" type="application/rss+xml" title="Posts" href="/feed.xml">',
          )
        : feedBody(),
    );

    await expect(
      discoverFeedCandidates("https://example.com/"),
    ).resolves.toEqual({
      status: "feed",
      feedUrl: "https://example.com/feed.xml",
    });
  });

  it("asks which feed when a page advertises several, without subscribing", async () => {
    mocks.fetchFeedUrl.mockResolvedValue(
      htmlBody(
        '<link rel="alternate" type="application/rss+xml" title="Posts" href="/feed.xml">' +
          '<link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed.xml">' +
          '<link rel="alternate" type="application/feed+json" href="/notes.json">',
      ),
    );

    await expect(
      discoverFeedCandidates("https://example.com/"),
    ).resolves.toEqual({
      status: "candidates",
      candidates: [
        { url: "https://example.com/feed.xml", title: "Posts" },
        { url: "https://example.com/comments/feed.xml", title: "Comments" },
        { url: "https://example.com/notes.json", title: null },
      ],
    });
    // The page itself, and nothing else: labelling candidates costs no requests.
    expect(mocks.fetchFeedUrl).toHaveBeenCalledTimes(1);
  });

  it("probes the common paths when a page advertises nothing", async () => {
    mocks.fetchFeedUrl.mockImplementation(async (url: string) => {
      if (url === "https://example.com/") return htmlBody("<html></html>");
      if (url === "https://example.com/rss.xml") return feedBody();
      return notFound();
    });

    await expect(
      discoverFeedCandidates("https://example.com/"),
    ).resolves.toEqual({
      status: "feed",
      feedUrl: "https://example.com/rss.xml",
    });
  });

  it("reports a dead end rather than guessing", async () => {
    mocks.fetchFeedUrl.mockImplementation(async (url: string) =>
      url === "https://example.com/" ? htmlBody("<html></html>") : notFound(),
    );

    await expect(
      discoverFeedCandidates("https://example.com/"),
    ).resolves.toEqual({
      status: "none",
      error: "No feed found at that address.",
    });
  });

  it("passes a fetch failure's reason through", async () => {
    mocks.fetchFeedUrl.mockResolvedValue({
      status: "error",
      error: "The feed address resolves to a private network address.",
    });

    await expect(
      discoverFeedCandidates("http://192.168.1.1/feed"),
    ).resolves.toEqual({
      status: "none",
      error: "The feed address resolves to a private network address.",
    });
  });

  it("refuses a non-HTTP scheme before any request leaves", async () => {
    await expect(
      discoverFeedCandidates("javascript:alert(1)"),
    ).resolves.toMatchObject({ status: "none" });
    expect(mocks.fetchFeedUrl).not.toHaveBeenCalled();
  });

  it("resolves a YouTube channel URL to its native feed without a page fetch", async () => {
    mocks.fetchFeedUrl.mockResolvedValue(feedBody());

    await expect(
      discoverFeedCandidates(
        "https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA",
      ),
    ).resolves.toEqual({
      status: "feed",
      feedUrl:
        "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
    });
    expect(mocks.fetchFeedUrl).toHaveBeenCalledTimes(1);
  });

  it("resolves a YouTube handle from the channel page", async () => {
    mocks.fetchFeedUrl.mockImplementation(async (url: string) =>
      url === "https://www.youtube.com/@someone"
        ? htmlBody(
            '<link rel="canonical" href="https://www.youtube.com/channel/UCtheRealOne">',
          )
        : feedBody(),
    );

    await expect(
      discoverFeedCandidates("https://www.youtube.com/@someone"),
    ).resolves.toEqual({
      status: "feed",
      feedUrl:
        "https://www.youtube.com/feeds/videos.xml?channel_id=UCtheRealOne",
    });
  });
});
