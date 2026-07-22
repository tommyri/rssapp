import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyApple: vi.fn(),
  verifyGoogle: vi.fn(),
  resolveAccount: vi.fn(),
  createSession: vi.fn(),
  updateUser: vi.fn(),
  checkLimit: vi.fn(),
  consumeLimit: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    update: () => ({ set: () => ({ where: mocks.updateUser }) }),
  },
}));

vi.mock("@/lib/native-provider-proof", () => ({
  verifyNativeAppleProof: mocks.verifyApple,
  verifyNativeGoogleProof: mocks.verifyGoogle,
}));

vi.mock("@/lib/native-provider-accounts", () => ({
  resolveNativeProviderAccount: mocks.resolveAccount,
}));

vi.mock("@/lib/native-app-sessions", () => ({
  createNativeAppSession: mocks.createSession,
}));

vi.mock("@/lib/auth-rate-limit", () => ({
  AUTH_RATE_LIMITS: { signInNetwork: { bucket: "network" } },
  checkAuthRateLimit: mocks.checkLimit,
  consumeAuthRateLimit: mocks.consumeLimit,
  networkRateLimitKeyFromHeaders: () => "network:test",
}));

import { POST } from "./route";

const account = {
  id: 7,
  email: "reader@example.com",
  displayName: "Reader",
  sessionVersion: 2,
};

describe("native provider session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkLimit.mockResolvedValue({
      limited: false,
      retryAfterSeconds: 0,
    });
    mocks.updateUser.mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue({
      account,
      tokens: {
        accessToken: "currentfold_access_example",
        accessTokenExpiresAt: new Date("2026-07-22T12:15:00Z"),
        refreshToken: "currentfold_refresh_example",
        refreshTokenExpiresAt: new Date("2026-08-21T12:00:00Z"),
      },
    });
  });

  it("exchanges a verified Google identity for a device session", async () => {
    const identity = {
      provider: "google",
      subject: "google-subject",
      email: account.email,
      emailVerified: true,
      displayName: account.displayName,
    };
    mocks.verifyGoogle.mockResolvedValue(identity);
    mocks.resolveAccount.mockResolvedValue({ kind: "account", account });

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/provider-session", {
        method: "POST",
        body: JSON.stringify({
          provider: "google",
          identityToken: "google-id-token",
          deviceName: "Reader's iPhone",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyGoogle).toHaveBeenCalledWith("google-id-token");
    expect(mocks.resolveAccount).toHaveBeenCalledWith({
      identity,
      inviteToken: undefined,
    });
    expect(mocks.createSession).toHaveBeenCalledWith({
      user: account,
      deviceName: "Reader's iPhone",
    });
    expect((await response.json()).data.account.id).toBe("7");
  });

  it("binds Apple proof to its one-time server challenge", async () => {
    const identity = {
      provider: "apple",
      subject: "apple-subject",
      email: account.email,
      emailVerified: true,
      displayName: account.displayName,
    };
    mocks.verifyApple.mockResolvedValue(identity);
    mocks.resolveAccount.mockResolvedValue({ kind: "account", account });

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/provider-session", {
        method: "POST",
        body: JSON.stringify({
          provider: "apple",
          identityToken: "apple-id-token",
          challenge: "currentfold_challenge_example",
          displayName: "Reader",
          inviteToken: "invite-token",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyApple).toHaveBeenCalledWith({
      identityToken: "apple-id-token",
      challenge: "currentfold_challenge_example",
      displayName: "Reader",
    });
    expect(mocks.resolveAccount).toHaveBeenCalledWith({
      identity,
      inviteToken: "invite-token",
    });
  });

  it("rate-limits rejected provider proofs", async () => {
    mocks.verifyGoogle.mockResolvedValue(null);

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/provider-session", {
        method: "POST",
        body: JSON.stringify({
          provider: "google",
          identityToken: "forged-token",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("invalid_provider_proof");
    expect(mocks.consumeLimit).toHaveBeenCalledOnce();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("does not merge a new provider subject into an email-matching account", async () => {
    mocks.verifyGoogle.mockResolvedValue({
      provider: "google",
      subject: "new-subject",
      email: account.email,
      emailVerified: true,
      displayName: null,
    });
    mocks.resolveAccount.mockResolvedValue({ kind: "link_required" });

    const response = await POST(
      new Request("https://currentfold.test/api/v1/auth/provider-session", {
        method: "POST",
        body: JSON.stringify({
          provider: "google",
          identityToken: "valid-token",
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("provider_link_required");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
