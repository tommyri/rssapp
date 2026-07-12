import { describe, expect, it } from "vitest";
import { clampSwipe, SWIPE_MAX_PX, SWIPE_SLOP_PX, swipeIntent } from "./swipe";

describe("swipeIntent", () => {
  it("stays pending inside the slop", () => {
    expect(swipeIntent(0, 0)).toBe("pending");
    expect(swipeIntent(SWIPE_SLOP_PX, 0)).toBe("pending");
    expect(swipeIntent(-SWIPE_SLOP_PX, 4)).toBe("pending");
  });

  it("claims a clearly horizontal drag", () => {
    expect(swipeIntent(30, 5)).toBe("horizontal");
    expect(swipeIntent(-30, 5)).toBe("horizontal");
  });

  it("leaves a vertical drag to the browser's scroll", () => {
    expect(swipeIntent(4, 30)).toBe("vertical");
    expect(swipeIntent(0, -30)).toBe("vertical");
  });

  it("vertical wins a diagonal — hijacking scroll is the worse failure", () => {
    // 20px across, 15px down: horizontal but not by the required ratio.
    expect(swipeIntent(20, 15)).toBe("vertical");
  });
});

describe("clampSwipe", () => {
  it("follows the finger within the cap", () => {
    expect(clampSwipe(40, true, true)).toBe(40);
    expect(clampSwipe(-40, true, true)).toBe(-40);
  });

  it("caps travel in both directions", () => {
    expect(clampSwipe(500, true, true)).toBe(SWIPE_MAX_PX);
    expect(clampSwipe(-500, true, true)).toBe(-SWIPE_MAX_PX);
  });

  it("refuses to move toward a direction with no action", () => {
    expect(clampSwipe(40, false, true)).toBe(0);
    expect(clampSwipe(-40, true, false)).toBe(0);
    expect(clampSwipe(-40, true, true)).toBe(-40);
  });
});
