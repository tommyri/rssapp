import { describe, expect, it } from "vitest";
import { shouldIgnoreKeyboard } from "./keyboard";

function mockEl(
  tag: string,
  opts?: { contentEditable?: boolean },
): EventTarget {
  return {
    tagName: tag.toUpperCase(),
    isContentEditable: opts?.contentEditable ?? false,
  } as unknown as HTMLElement;
}

describe("shouldIgnoreKeyboard", () => {
  it("ignores typing in form fields", () => {
    expect(shouldIgnoreKeyboard(mockEl("input"))).toBe(true);
    expect(shouldIgnoreKeyboard(mockEl("textarea"))).toBe(true);
    expect(shouldIgnoreKeyboard(mockEl("select"))).toBe(true);
  });

  it("ignores contenteditable regions", () => {
    expect(shouldIgnoreKeyboard(mockEl("div", { contentEditable: true }))).toBe(
      true,
    );
  });

  it("allows shortcuts from ordinary click targets", () => {
    expect(shouldIgnoreKeyboard(mockEl("button"))).toBe(false);
    expect(shouldIgnoreKeyboard(mockEl("div"))).toBe(false);
  });

  it("allows shortcuts when the target is not an element", () => {
    expect(shouldIgnoreKeyboard(null)).toBe(false);
  });
});
