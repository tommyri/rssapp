import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { execute: mocks.execute },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RSSAPP_VERSION", "2026.7.3");
    vi.stubEnv("RSSAPP_REVISION", "4cc354b7dd824f72bfa3db88d8350a8a151f0505");
  });

  it("reports ready only when Postgres is reachable", async () => {
    mocks.execute.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      version: "2026.7.3",
      revision: "4cc354b7dd824f72bfa3db88d8350a8a151f0505",
      shortRevision: "4cc354b7dd82",
    });
  });

  it("reports unavailable without exposing the database error", async () => {
    mocks.execute.mockRejectedValue(new Error("connection refused"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      version: "2026.7.3",
      revision: "4cc354b7dd824f72bfa3db88d8350a8a151f0505",
      shortRevision: "4cc354b7dd82",
    });
  });
});
