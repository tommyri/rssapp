import { describe, expect, it } from "vitest";
import {
  formatAudioTimestamp,
  resumableAudioPosition,
  withAudioProgress,
} from "./audio-progress";

describe("resumableAudioPosition", () => {
  it("keeps a meaningful position before an episode ends", () => {
    expect(resumableAudioPosition(125.4, 1800)).toBe(125.4);
  });

  it("does not resume at the beginning or final seconds", () => {
    expect(resumableAudioPosition(4, 1800)).toBeNull();
    expect(resumableAudioPosition(1797, 1800)).toBeNull();
  });

  it("keeps a meaningful position when a podcast host reports an infinite duration", () => {
    expect(resumableAudioPosition(3_600, Number.POSITIVE_INFINITY)).toBe(3_600);
  });

  it("rejects invalid media metadata", () => {
    expect(resumableAudioPosition(Number.NaN, 1800)).toBeNull();
    expect(resumableAudioPosition(30, Number.NaN)).toBe(30);
  });
});

describe("formatAudioTimestamp", () => {
  it("formats short and long timestamps", () => {
    expect(formatAudioTimestamp(65.9)).toBe("1:05");
    expect(formatAudioTimestamp(3665)).toBe("1:01:05");
  });
});

describe("withAudioProgress", () => {
  it("tracks positions independently for audio sources in the same post", () => {
    const first = withAudioProgress({}, "https://cdn.example.com/one.m4a", 60);
    const second = withAudioProgress(
      first,
      "https://cdn.example.com/two.m4a",
      120,
    );

    expect(second).toEqual({
      "https://cdn.example.com/one.m4a": 60,
      "https://cdn.example.com/two.m4a": 120,
    });
    expect(
      withAudioProgress(second, "https://cdn.example.com/one.m4a", null),
    ).toEqual({
      "https://cdn.example.com/two.m4a": 120,
    });
  });
});
