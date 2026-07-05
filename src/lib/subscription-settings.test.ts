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
      fullContent: false,
      autoReadDays: null,
      sortOrder: "newest",
      defaultUnreadOnly: true,
    });
  });

  it("reads stored overrides", () => {
    expect(
      parseSubscriptionSettings({
        fullContent: true,
        autoReadDays: 14,
        sortOrder: "oldest",
        defaultUnreadOnly: false,
      }),
    ).toEqual({
      fullContent: true,
      autoReadDays: 14,
      sortOrder: "oldest",
      defaultUnreadOnly: false,
    });
  });
});

describe("buildSubscriptionSettings", () => {
  it("merges without dropping unrelated keys", () => {
    const next = buildSubscriptionSettings(
      { autoReadDays: 7, sortOrder: "oldest" },
      {
        fullContent: true,
        autoReadDays: null,
        sortOrder: "newest",
        defaultUnreadOnly: true,
      },
    );
    expect(next).toEqual({ fullContent: true });
  });

  it("stores non-default sort and show-all preference", () => {
    const next = buildSubscriptionSettings(
      {},
      {
        fullContent: false,
        autoReadDays: null,
        sortOrder: "oldest",
        defaultUnreadOnly: false,
      },
    );
    expect(next).toEqual({
      fullContent: false,
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
