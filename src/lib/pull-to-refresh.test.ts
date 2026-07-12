import { describe, expect, it } from "vitest";
import {
  PULL_TO_REFRESH_THRESHOLD,
  pullToRefreshArmed,
  pullToRefreshDistance,
} from "./pull-to-refresh";

describe("pull-to-refresh", () => {
  it("only responds to a predominantly vertical pull at the top of the pane", () => {
    expect(pullToRefreshDistance({ x: 0, y: 0 }, { x: 0, y: 80 }, 0)).toBe(40);
    expect(pullToRefreshDistance({ x: 0, y: 0 }, { x: 90, y: 80 }, 0)).toBe(0);
    expect(pullToRefreshDistance({ x: 0, y: 80 }, { x: 0, y: 0 }, 0)).toBe(0);
    expect(pullToRefreshDistance({ x: 0, y: 0 }, { x: 0, y: 80 }, 1)).toBe(0);
  });

  it("caps the displayed pull and arms only at the release threshold", () => {
    expect(pullToRefreshDistance({ x: 0, y: 0 }, { x: 0, y: 500 }, 0)).toBe(96);
    expect(pullToRefreshArmed(PULL_TO_REFRESH_THRESHOLD - 1)).toBe(false);
    expect(pullToRefreshArmed(PULL_TO_REFRESH_THRESHOLD)).toBe(true);
  });
});
