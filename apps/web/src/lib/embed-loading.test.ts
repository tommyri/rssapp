import { describe, expect, it } from "vitest";
import {
  normalizeEmbedLoadingPreferences,
  resolveEmbedLoading,
} from "./embed-loading";

describe("embed loading preferences", () => {
  it("defaults to click-to-load when no valid preference exists", () => {
    const preferences = normalizeEmbedLoadingPreferences(undefined);

    expect(preferences).toEqual({ default: "click", providers: {} });
    expect(resolveEmbedLoading(preferences, "youtube")).toBe("click");
  });

  it("uses a platform override ahead of the global default", () => {
    const preferences = normalizeEmbedLoadingPreferences({
      default: "auto",
      providers: { tweet: "click", youtube: "auto" },
    });

    expect(resolveEmbedLoading(preferences, "youtube")).toBe("auto");
    expect(resolveEmbedLoading(preferences, "vimeo")).toBe("auto");
    expect(resolveEmbedLoading(preferences, "tweet")).toBe("click");
  });

  it("ignores malformed data from persisted settings", () => {
    expect(
      normalizeEmbedLoadingPreferences({
        default: "all-the-things",
        providers: { youtube: "yes", vimeo: "click", unknown: "auto" },
      }),
    ).toEqual({ default: "click", providers: { vimeo: "click" } });
  });
});
