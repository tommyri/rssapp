import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  checkLimits: vi.fn(),
  consumeLimits: vi.fn(),
  clearLimit: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  authenticateAccess: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: { users: { findFirst: mocks.findUser } },
    update: () => ({ set: () => ({ where: mocks.updateUser }) }),
  },
}));

vi.mock("@/lib/auth-rate-limit", () => ({
  AUTH_RATE_LIMITS: {
    signInEmail: { bucket: "email" },
    signInNetwork: { bucket: "network" },
  },
  checkAuthRateLimits: mocks.checkLimits,
  consumeAuthRateLimits: mocks.consumeLimits,
  clearAuthRateLimit: mocks.clearLimit,
  emailRateLimitKey: (email: string) => `email:${email}`,
  networkRateLimitKeyFromHeaders: () => "network:test",
}));

vi.mock("@/lib/password", () => ({ verifyPassword: mocks.verifyPassword }));

vi.mock("@/lib/native-app-sessions", () => ({
  createNativeAppSession: mocks.createSession,
  authenticateNativeAccessToken: mocks.authenticateAccess,
  revokeNativeAppSession: mocks.revokeSession,
}));

import { DELETE, POST } from "./route";

const activeUser = {
  id: 7,
  email: "reader@example.com",
  displayName: "Reader",
  passwordHash: "stored",
  emailVerifiedAt: new Date("2026-07-01T10:00:00Z"),
  sessionVersion: 2,
};

describe("native session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkLimits.mockResolvedValue({
      limited: false,
      retryAfterSeconds: 0,
    });
    mocks.consumeLimits.mockResolvedValue({
      limited: false,
      retryAfterSeconds: 0,
    });
    mocks.updateUser.mockResolvedValue(undefined);
    mocks.clearLimit.mockResolvedValue(undefined);
  });

  it("creates a device session after verified password authentication", async () => {
    mocks.findUser.mockResolvedValue(activeUser);
    mocks.verifyPassword.mockReturnValue(true);
    mocks.createSession.mockResolvedValue({
      account: activeUser,
      tokens: {
        accessToken: "currentfold_access_example",
        accessTokenExpiresAt: new Date("2026-07-22T12:15:00Z"),
        refreshToken: "currentfold_refresh_example",
        refreshTokenExpiresAt: new Date("2026-08-21T12:00:00Z"),
      },
    });

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "Reader@Example.com",
          password: "correct horse battery staple",
          deviceName: "Reader's iPhone",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledWith({
      user: activeUser,
      deviceName: "Reader's iPhone",
    });
    expect((await response.json()).data.account.id).toBe("7");
  });

  it("does not create a session before email verification", async () => {
    mocks.findUser.mockResolvedValue({ ...activeUser, emailVerifiedAt: null });
    mocks.verifyPassword.mockReturnValue(true);

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/session", {
        method: "POST",
        body: JSON.stringify({
          email: activeUser.email,
          password: "correct horse battery staple",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "email_unverified",
        message: "Verify your email address before signing in.",
      },
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("counts invalid credentials without exposing account existence", async () => {
    mocks.findUser.mockResolvedValue(undefined);

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/session", {
        method: "POST",
        body: JSON.stringify({
          email: "missing@example.com",
          password: "wrong",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_credentials");
    expect(mocks.consumeLimits).toHaveBeenCalledOnce();
  });

  it("revokes the current native device session on sign out", async () => {
    const principal = { id: 7, sessionId: "session" };
    mocks.authenticateAccess.mockResolvedValue(principal);

    const response = await DELETE(
      new Request("https://currentfold.test/api/v1/auth/session", {
        method: "DELETE",
        headers: { authorization: "Bearer currentfold_access_example" },
      }),
    );

    expect(response.status).toBe(204);
    expect(mocks.revokeSession).toHaveBeenCalledWith(principal);
  });
});
