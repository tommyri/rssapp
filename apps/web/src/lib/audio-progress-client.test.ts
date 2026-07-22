import { afterEach, describe, expect, it, vi } from "vitest";
import { persistItemAudioProgress } from "./audio-progress-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("persistItemAudioProgress", () => {
  it("uses a same-origin keepalive request for a successful progress write", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    globalThis.fetch = fetchMock;

    await expect(
      persistItemAudioProgress({
        itemId: 42,
        audioUrl: "https://cdn.example.com/episode.m4a",
        progress: 1_800,
      }),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audio-progress",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
        body: JSON.stringify({
          itemId: 42,
          audioUrl: "https://cdn.example.com/episode.m4a",
          progress: 1_800,
        }),
      }),
    );
  });

  it("reports a failed write without throwing into a media event", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await expect(
      persistItemAudioProgress({
        itemId: 42,
        audioUrl: "https://cdn.example.com/episode.m4a",
        progress: null,
      }),
    ).resolves.toBe(false);
  });
});
