import { describe, expect, it } from "vitest";
import { parseSavedPageExtractionSnapshot } from "./saved-page-extraction";

describe("saved-page extraction snapshots", () => {
  it("accepts a complete pending or terminal snapshot", () => {
    expect(
      parseSavedPageExtractionSnapshot({
        id: 7,
        status: "ready",
        error: null,
        title: "Saved article",
        author: null,
        feedTitle: "Example",
        contentHtml: "<p>Readable.</p>",
      }),
    ).toEqual(
      expect.objectContaining({
        id: 7,
        status: "ready",
        contentHtml: "<p>Readable.</p>",
      }),
    );
  });

  it("rejects malformed or unknown status payloads", () => {
    expect(
      parseSavedPageExtractionSnapshot({
        id: 7,
        status: "processing",
        title: "Saved article",
      }),
    ).toBeNull();
    expect(parseSavedPageExtractionSnapshot(null)).toBeNull();
  });
});
