import { describe, expect, it } from "vitest";
import {
  AUTH_RATE_LIMITS,
  emailRateLimitKey,
  hashAuthRateLimitKey,
  rateLimitRetryAfterSeconds,
} from "./auth-rate-limit";

describe("authentication rate limits", () => {
  it("keeps the public endpoints bounded at humane thresholds", () => {
    expect(AUTH_RATE_LIMITS.signInEmail.maxAttempts).toBe(10);
    expect(AUTH_RATE_LIMITS.signInNetwork.maxAttempts).toBe(30);
    expect(AUTH_RATE_LIMITS.signUpEmail.maxAttempts).toBe(3);
    expect(AUTH_RATE_LIMITS.recoveryEmail.maxAttempts).toBe(5);
  });

  it("bounds link saving without getting in a reader's way", () => {
    // Enough to bookmark a screenful of open tabs in one sitting, while capping
    // what the endpoint can be made to fetch on someone else's behalf.
    expect(AUTH_RATE_LIMITS.saveLink.maxAttempts).toBe(40);
    expect(AUTH_RATE_LIMITS.saveLink.windowMs).toBe(5 * 60 * 1000);
  });

  it("hashes normalized source values rather than retaining them", () => {
    const key = emailRateLimitKey("  TOMMY@example.com ");
    expect(key).toBe("email:tommy@example.com");
    expect(hashAuthRateLimitKey("sign_in", key)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAuthRateLimitKey("sign_in", key)).not.toContain("tommy");
  });

  it("rounds a retry delay up so users never retry too early", () => {
    const started = new Date("2026-07-17T10:00:00.000Z");
    expect(
      rateLimitRetryAfterSeconds(
        started,
        60_000,
        new Date("2026-07-17T10:00:59.001Z"),
      ),
    ).toBe(1);
  });
});
