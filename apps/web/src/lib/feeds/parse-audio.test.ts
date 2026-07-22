import { describe, expect, it } from "vitest";
import { parseFeed } from "./parse";

describe("podcast enclosures", () => {
  it("captures an RSS audio enclosure for native playback", async () => {
    const feed = await parseFeed(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>Show</title><item><guid>ep-1</guid><title>Episode 1</title><enclosure url="https://cdn.example.com/episode.mp3" type="audio/mpeg" /></item></channel></rss>`,
      "application/rss+xml",
    );

    expect(feed.items[0]).toMatchObject({
      audioUrl: "https://cdn.example.com/episode.mp3",
      audioType: "audio/mpeg",
    });
  });

  it("uses the first playable JSON Feed attachment and ignores video", async () => {
    const feed = await parseFeed(
      JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "Show",
        items: [
          {
            id: "ep-2",
            attachments: [
              {
                url: "https://cdn.example.com/trailer.mp4",
                mime_type: "video/mp4",
              },
              {
                url: "https://cdn.example.com/episode.ogg",
                mime_type: "audio/ogg",
              },
            ],
          },
        ],
      }),
      "application/feed+json",
    );

    expect(feed.items[0]).toMatchObject({
      audioUrl: "https://cdn.example.com/episode.ogg",
      audioType: "audio/ogg",
    });
  });

  it("resolves episode artwork against the entry URL before storing it", async () => {
    const feed = await parseFeed(
      JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "Show",
        items: [
          {
            id: "ep-3",
            url: "https://podcasts.example.com/shows/episode-3",
            content_html: '<img src="/img/podcast/rss.png">',
            attachments: [
              {
                url: "https://cdn.example.com/episode.mp3",
                mime_type: "audio/mpeg",
              },
            ],
          },
        ],
      }),
      "application/feed+json",
    );

    expect(feed.items[0].contentHtml).toContain(
      'src="https://podcasts.example.com/img/podcast/rss.png"',
    );
  });
});
