import { describe, expect, it } from "vitest";
import {
  decodeGReaderContinuation,
  encodeGReaderContinuation,
  feedStreamId,
  GOOGLE_READER_READ,
  GOOGLE_READER_READING_LIST,
  googleReaderItemId,
  labelStreamId,
  parseGoogleReaderItemId,
  parseGReaderLimit,
  parseGReaderStream,
  parseGReaderTimestamp,
  toGReaderTimestampUsec,
} from "@/lib/greader-protocol";

describe("Google Reader protocol helpers", () => {
  it("uses stable stream and opaque hexadecimal item ids", () => {
    expect(feedStreamId("https://example.com/feed.xml")).toBe(
      "feed/https://example.com/feed.xml",
    );
    expect(labelStreamId("Research")).toBe("user/-/label/Research");
    expect(googleReaderItemId(42)).toBe(
      "tag:google.com,2005:reader/item/000000000000002a",
    );
    expect(parseGoogleReaderItemId(googleReaderItemId(42))).toBe(42);
    expect(parseGoogleReaderItemId("42")).toBeNull();
  });

  it("parses state, feed, and encoded label streams", () => {
    expect(parseGReaderStream(GOOGLE_READER_READING_LIST)).toEqual({
      kind: "reading-list",
    });
    expect(parseGReaderStream(GOOGLE_READER_READ)).toEqual({ kind: "read" });
    expect(parseGReaderStream("feed/https://example.com/feed.xml")).toEqual({
      kind: "feed",
      url: "https://example.com/feed.xml",
    });
    expect(parseGReaderStream("user%2F-%2Flabel%2FRead%20later")).toEqual({
      kind: "label",
      name: "Read later",
    });
    expect(parseGReaderStream("unknown")).toBeNull();
  });

  it("keeps continuations and numeric parameters bounded", () => {
    const continuation = encodeGReaderContinuation({
      sortAt: "2026-07-18T10:00:00.000Z",
      itemId: 9,
    });
    expect(decodeGReaderContinuation(continuation)).toEqual({
      sortAt: "2026-07-18T10:00:00.000Z",
      itemId: 9,
    });
    expect(decodeGReaderContinuation("not-a-cursor")).toBeNull();
    expect(parseGReaderLimit("10001")).toBe(1_000);
    expect(parseGReaderLimit("0")).toBe(1);
    expect(parseGReaderLimit("bad")).toBe(20);
    expect(parseGReaderTimestamp("123")).toEqual(new Date(123_000));
    expect(parseGReaderTimestamp("-1")).toBeNull();
    expect(toGReaderTimestampUsec(new Date(123))).toBe("123000");
  });
});
