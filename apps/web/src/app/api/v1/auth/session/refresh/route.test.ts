import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rotate: vi.fn() }));

vi.mock("@/lib/native-app-sessions", () => ({
  rotateNativeAppSession: mocks.rotate,
}));

import { POST } from "./route";

describe("native session refresh route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns one rotated credential pair", async () => {
    mocks.rotate.mockResolvedValue({
      account: { id: 7, email: "reader@example.com", displayName: null },
      tokens: {
        accessToken: "currentfold_access_next",
        accessTokenExpiresAt: new Date("2026-07-22T12:15:00Z"),
        refreshToken: "currentfold_refresh_next",
        refreshTokenExpiresAt: new Date("2026-08-21T12:00:00Z"),
      },
    });

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/session/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: "currentfold_refresh_previous" }),
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.session).toMatchObject({
      accessToken: "currentfold_access_next",
      refreshToken: "currentfold_refresh_next",
    });
  });

  it("requires interactive sign-in after refresh rejection", async () => {
    mocks.rotate.mockResolvedValue(null);

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/session/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: "expired" }),
      }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_refresh_token");
  });
});
