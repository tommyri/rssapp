import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/build-identity", () => ({
  getBuildIdentity: () => ({ version: "2026.8.1" }),
}));

import { GET } from "./route";

describe("GET /api/v1", () => {
  it("advertises every capability a client is allowed to assume", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // Pinned rather than sampled: a client gates features on these names, so
    // dropping or renaming one is a contract change, not an implementation
    // detail. New capabilities append.
    expect(body.data.capabilities).toEqual([
      "account",
      "nativeAuthentication",
      "nativeProviderAuthentication",
      "subscriptions",
      "articleStream",
      "articleStreamFilters",
      "articleReadState",
      "articleStarredState",
      "articleReadLaterState",
      "articleMarkAllRead",
      "articleReadingProgress",
      "savedPages",
      "savedPageRetry",
      "savedPageReadState",
      "savedPageReadingProgress",
      "subscriptionCreate",
    ]);
    expect(body.data.links).toEqual({ openApi: "/api/v1/openapi.json" });
  });
});
