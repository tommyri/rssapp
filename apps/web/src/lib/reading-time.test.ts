import { describe, expect, it } from "vitest";
import { readingTimeMinutes, wordCount } from "./reading-time";

/** Build HTML with exactly `n` words. */
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("wordCount", () => {
  it("counts words across tags", () => {
    expect(wordCount("<p>Hello <b>brave</b> new world</p>")).toBe(4);
  });

  it("treats tags as separators, not glue", () => {
    // "one</p><p>two" must not merge into a single word.
    expect(wordCount("<p>one</p><p>two</p>")).toBe(2);
  });

  it("collapses whitespace runs", () => {
    expect(wordCount("a\n\n  b\t c")).toBe(3);
  });

  it("returns 0 for empty and tag-only content", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("<p><img src='x'/></p>")).toBe(0);
  });
});

describe("readingTimeMinutes", () => {
  it("returns null for null or empty html", () => {
    expect(readingTimeMinutes(null)).toBeNull();
    expect(readingTimeMinutes("")).toBeNull();
  });

  it("returns null below the stub threshold (no noisy ~1 min)", () => {
    expect(readingTimeMinutes(`<p>${words(29)}</p>`)).toBeNull();
  });

  it("returns 1 for short-but-real content", () => {
    expect(readingTimeMinutes(`<p>${words(30)}</p>`)).toBe(1);
    expect(readingTimeMinutes(`<p>${words(225)}</p>`)).toBe(1);
  });

  it("rounds up rather than under-promising", () => {
    expect(readingTimeMinutes(`<p>${words(226)}</p>`)).toBe(2);
    expect(readingTimeMinutes(`<p>${words(450)}</p>`)).toBe(2);
    expect(readingTimeMinutes(`<p>${words(1125)}</p>`)).toBe(5);
  });
});
