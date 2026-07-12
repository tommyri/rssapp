import { describe, expect, it } from "vitest";
import {
  readingProgressAtScroll,
  resumableReadingProgress,
  scrollContainerGeometry,
  scrollForReadingProgress,
} from "@/lib/reading-progress";

describe("reading progress", () => {
  const geometry = {
    articleTop: 1_000,
    articleHeight: 1_600,
    viewportHeight: 800,
  };

  it("calculates progress from the article rather than the document", () => {
    expect(readingProgressAtScroll({ ...geometry, scrollY: 880 })).toBe(0);
    expect(
      readingProgressAtScroll({ ...geometry, scrollY: 1_340 }),
    ).toBeCloseTo(0.5);
    expect(readingProgressAtScroll({ ...geometry, scrollY: 1_800 })).toBe(1);
  });

  it("round-trips a saved progress value to its document offset", () => {
    const scrollY = scrollForReadingProgress({ ...geometry, progress: 0.5 });
    expect(readingProgressAtScroll({ ...geometry, scrollY })).toBeCloseTo(0.5);
  });

  it("uses the reader content pane's scroll coordinates", () => {
    expect(
      scrollContainerGeometry({
        articleTopInViewport: 240,
        containerTopInViewport: 40,
        scrollTop: 1_000,
        articleHeight: 1_600,
        viewportHeight: 800,
      }),
    ).toEqual({
      articleTop: 1_200,
      articleHeight: 1_600,
      scrollY: 1_000,
      viewportHeight: 800,
    });
  });

  it("does not resume articles that are barely started or effectively complete", () => {
    expect(resumableReadingProgress(null)).toBeNull();
    expect(resumableReadingProgress(0.05)).toBeNull();
    expect(resumableReadingProgress(0.42)).toBe(0.42);
    expect(resumableReadingProgress(0.95)).toBeNull();
  });
});
