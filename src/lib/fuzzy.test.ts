import { describe, expect, it } from "vitest";
import { fuzzyMatch } from "./fuzzy";

const score = (query: string, text: string) => {
  const result = fuzzyMatch(query, text);
  if (!result) throw new Error(`expected "${query}" to match "${text}"`);
  return result.score;
};

describe("fuzzyMatch — matching", () => {
  it("matches a subsequence case-insensitively", () => {
    expect(fuzzyMatch("hn", "Hacker News")).not.toBeNull();
    expect(fuzzyMatch("HACKER", "hacker news")).not.toBeNull();
  });

  it("returns null when not a subsequence", () => {
    expect(fuzzyMatch("xyz", "Hacker News")).toBeNull();
    expect(fuzzyMatch("news hacker", "Hacker News")).toBeNull(); // order matters
  });

  it("matches everything on an empty query, with score 0", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch("   ", "anything")).toEqual({ score: 0, indices: [] });
  });

  it("ignores spaces in the query", () => {
    expect(fuzzyMatch("man fee", "Manage feeds")).not.toBeNull();
  });

  it("reports the matched indices for highlighting", () => {
    expect(fuzzyMatch("hn", "Hacker News")?.indices).toEqual([0, 7]);
  });
});

describe("fuzzyMatch — ranking", () => {
  it("prefers word-start hits over scattered hits", () => {
    // "ma" hits two word starts in "Manage feeds"... and mid-word in "Amazing".
    expect(score("ma", "Manage feeds")).toBeGreaterThan(
      score("ma", "Le Amazing Blog"),
    );
  });

  it("prefers consecutive runs over scattered characters", () => {
    // Same length, same (non-)word-start hits — only the run bonus differs.
    expect(score("ab", "zabz")).toBeGreaterThan(score("ab", "zazb"));
  });

  it("breaks score ties by preferring the shorter text", () => {
    expect(score("rules", "Rules")).toBeGreaterThan(
      score("rules", "Rules of the internet"),
    );
  });
});
