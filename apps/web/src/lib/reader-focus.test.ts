import { describe, expect, it } from "vitest";
import { readerFocusActive } from "@/lib/reader-focus";

describe("reader focus mode", () => {
  it("never hides navigation without an expanded article", () => {
    expect(readerFocusActive(true, false)).toBe(false);
  });

  it("activates only when the reader requests it for an open article", () => {
    expect(readerFocusActive(false, true)).toBe(false);
    expect(readerFocusActive(true, true)).toBe(true);
  });
});
