import { describe, expect, it } from "vitest";
import { MAX_LABEL_NAME_LENGTH, normalizeLabelName } from "./labels";

describe("normalizeLabelName", () => {
  it("trims and collapses whitespace while preserving display casing", () => {
    expect(normalizeLabelName("  Long   reads  ")).toBe("Long reads");
  });

  it("rejects blank and overly long names", () => {
    expect(normalizeLabelName("   ")).toBeNull();
    expect(
      normalizeLabelName("a".repeat(MAX_LABEL_NAME_LENGTH + 1)),
    ).toBeNull();
  });
});
