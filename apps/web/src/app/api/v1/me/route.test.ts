import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));

import { GET } from "./route";

describe("GET /api/v1/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns stable string IDs for an authenticated account", async () => {
    mocks.authenticate.mockResolvedValue({
      id: 7,
      email: "reader@example.com",
      displayName: "Reader",
    });

    const response = await GET(
      new Request("https://currentfold.test/api/v1/me"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      data: {
        id: "7",
        email: "reader@example.com",
        displayName: "Reader",
      },
    });
  });

  it("returns a bearer challenge instead of an interactive redirect", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await GET(
      new Request("https://currentfold.test/api/v1/me"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="Currentfold API"',
    );
    expect(await response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Provide a valid Currentfold API bearer token.",
      },
    });
  });
});
