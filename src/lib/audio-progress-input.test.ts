import { describe, expect, it } from "vitest";
import { parseAudioProgressInput } from "./audio-progress-input";

describe("parseAudioProgressInput", () => {
  it("accepts a bounded, resumable HTTP(S) audio position", () => {
    expect(
      parseAudioProgressInput({
        itemId: 42,
        audioUrl: "https://cdn.example.com/episode.m4a",
        progress: 1_800,
      }),
    ).toEqual({
      itemId: 42,
      audioUrl: "https://cdn.example.com/episode.m4a",
      progress: 1_800,
    });
  });

  it("rejects an unbounded or non-HTTP(S) request payload", () => {
    expect(
      parseAudioProgressInput({
        itemId: 42,
        audioUrl: "file:///episode.m4a",
        progress: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });
});
