import { describe, expect, it } from "vitest";
import { alsoInLabel, otherFeedTitles } from "./duplicates";

describe("otherFeedTitles", () => {
  it("drops the row's own feed title", () => {
    expect(otherFeedTitles(["The Verge", "Hacker News"], "The Verge")).toEqual([
      "Hacker News",
    ]);
  });

  it("dedupes repeated feed titles", () => {
    expect(otherFeedTitles(["A", "B", "B", "A", "C"], "A")).toEqual(["B", "C"]);
  });

  it("skips null/blank titles (feeds with no title)", () => {
    expect(otherFeedTitles(["A", null, ""], "own")).toEqual(["A"]);
  });

  it("returns empty when the story only came from the own feed", () => {
    expect(otherFeedTitles(["A", "A"], "A")).toEqual([]);
  });

  it("handles a null aggregate", () => {
    expect(otherFeedTitles(null, "A")).toEqual([]);
  });
});

describe("alsoInLabel", () => {
  it("joins one or two feeds in full", () => {
    expect(alsoInLabel(["A"])).toBe("A");
    expect(alsoInLabel(["A", "B"])).toBe("A, B");
  });

  it("caps at two names and counts the rest", () => {
    expect(alsoInLabel(["A", "B", "C"])).toBe("A, B +1");
    expect(alsoInLabel(["A", "B", "C", "D", "E"])).toBe("A, B +3");
  });
});
