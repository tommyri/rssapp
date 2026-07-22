import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  availability: vi.fn(),
  createChallenge: vi.fn(),
  consumeLimit: vi.fn(),
}));

vi.mock("@/lib/native-provider-proof", () => ({
  nativeProviderAvailability: mocks.availability,
  createNativeAppleChallenge: mocks.createChallenge,
}));

vi.mock("@/lib/auth-rate-limit", () => ({
  AUTH_RATE_LIMITS: { providerChallengeNetwork: { bucket: "challenge" } },
  consumeAuthRateLimit: mocks.consumeLimit,
  networkRateLimitKeyFromHeaders: () => "network:test",
}));

import { POST } from "./route";

describe("native Apple challenge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeLimit.mockResolvedValue({
      limited: false,
      retryAfterSeconds: 0,
    });
  });

  it("returns a one-time challenge when Apple is configured", async () => {
    mocks.availability.mockReturnValue({ apple: true, google: false });
    mocks.createChallenge.mockResolvedValue("currentfold_challenge_example");

    const response = await POST(
      new Request(
        "https://currentfold.test/api/v1/auth/providers/apple/challenge",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { challenge: "currentfold_challenge_example" },
    });
  });

  it("does not advertise a challenge when Apple is unavailable", async () => {
    mocks.availability.mockReturnValue({ apple: false, google: false });

    const response = await POST(
      new Request(
        "https://currentfold.test/api/v1/auth/providers/apple/challenge",
      ),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("provider_unavailable");
    expect(mocks.createChallenge).not.toHaveBeenCalled();
  });

  it("rate-limits challenge creation before writing an intent", async () => {
    mocks.availability.mockReturnValue({ apple: true, google: false });
    mocks.consumeLimit.mockResolvedValue({
      limited: true,
      retryAfterSeconds: 42,
    });

    const response = await POST(
      new Request(
        "https://currentfold.test/api/v1/auth/providers/apple/challenge",
      ),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(mocks.createChallenge).not.toHaveBeenCalled();
  });
});
