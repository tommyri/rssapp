import { describe, expect, it } from "vitest";
import {
  hasRemainingReaderScroll,
  remainingReaderScroll,
} from "@/lib/reader-scroll";

describe("reader scroll container", () => {
  it("measures remaining distance from the content pane, not window scroll", () => {
    const pane = { scrollTop: 640, scrollHeight: 1_600, clientHeight: 800 };
    expect(remainingReaderScroll(pane)).toBe(160);
    expect(hasRemainingReaderScroll(pane)).toBe(true);
  });

  it("allows smart advance only at the article's final 48 pixels", () => {
    expect(
      hasRemainingReaderScroll({
        scrollTop: 752,
        scrollHeight: 1_600,
        clientHeight: 800,
      }),
    ).toBe(false);
    expect(
      hasRemainingReaderScroll({
        scrollTop: 751,
        scrollHeight: 1_600,
        clientHeight: 800,
      }),
    ).toBe(true);
  });
});
