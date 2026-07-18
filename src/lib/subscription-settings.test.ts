import { describe, expect, it } from "vitest";
import {
  buildSubscriptionSettings,
  effectiveShowingAll,
  parseSubscriptionSettings,
  toggleShowHref,
} from "./subscription-settings";

describe("parseSubscriptionSettings", () => {
  it("applies defaults for empty settings", () => {
    expect(parseSubscriptionSettings({})).toEqual({
      autoReadDays: null,
      sortOrder: "newest",
      defaultUnreadOnly: true,
      paused: false,
    });
  });

  it("reads stored overrides", () => {
    expect(
      parseSubscriptionSettings({
        autoReadDays: 14,
        sortOrder: "oldest",
        defaultUnreadOnly: false,
        paused: true,
      }),
    ).toEqual({
      autoReadDays: 14,
      sortOrder: "oldest",
      defaultUnreadOnly: false,
      paused: true,
    });
  });
});

describe("buildSubscriptionSettings", () => {
  it("merges without dropping unrelated keys and retires the legacy flag", () => {
    const next = buildSubscriptionSettings(
      { autoReadDays: 7, sortOrder: "oldest", fullContent: true } as never,
      {
        autoReadDays: null,
        sortOrder: "newest",
        defaultUnreadOnly: true,
      },
    );
    expect(next).toEqual({});
  });

  it("preserves a pause through a Save (only setSubscriptionPaused writes it)", () => {
    const next = buildSubscriptionSettings(
      { paused: true, autoReadDays: 7 },
      {
        autoReadDays: null,
        sortOrder: "newest",
        defaultUnreadOnly: true,
      },
    );
    expect(next).toEqual({ paused: true });
  });

  it("stores non-default sort and show-all preference", () => {
    const next = buildSubscriptionSettings(
      {},
      {
        autoReadDays: null,
        sortOrder: "oldest",
        defaultUnreadOnly: false,
      },
    );
    expect(next).toEqual({
      sortOrder: "oldest",
      defaultUnreadOnly: false,
    });
  });
});

describe("effectiveShowingAll", () => {
  it("honours explicit show params", () => {
    expect(effectiveShowingAll("all", true)).toBe(true);
    expect(effectiveShowingAll("unread", false)).toBe(false);
  });

  it("defaults to unread-only globally", () => {
    expect(effectiveShowingAll(undefined, undefined)).toBe(false);
  });

  it("opens show-all feeds on all articles", () => {
    expect(effectiveShowingAll(undefined, false)).toBe(true);
  });
});

describe("toggleShowHref", () => {
  it("adds show=all from the unread default", () => {
    expect(toggleShowHref({ feed: "3" }, true)).toBe("/?feed=3&show=all");
  });

  it("adds show=unread when leaving a show-all-default feed", () => {
    expect(toggleShowHref({ feed: "3", show: "all" }, false)).toBe(
      "/?feed=3&show=unread",
    );
  });

  it("drops show param when returning to unread default", () => {
    expect(toggleShowHref({ feed: "3", show: "all" }, true)).toBe("/?feed=3");
  });
});
