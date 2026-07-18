import { describe, expect, it } from "vitest";
import {
  FULL_CONTENT_LOCK_MS,
  isFullContentStatus,
  MAX_FULL_CONTENT_ATTEMPTS,
  nextFullContentRetryAt,
} from "./full-content-policy";

describe("full-content extraction policy", () => {
  const now = new Date("2026-07-19T12:00:00.000Z");

  it("backs off retryable failures and stops at the bounded attempt limit", () => {
    expect(nextFullContentRetryAt(1, now)?.toISOString()).toBe(
      "2026-07-19T12:05:00.000Z",
    );
    expect(nextFullContentRetryAt(2, now)?.toISOString()).toBe(
      "2026-07-19T12:30:00.000Z",
    );
    expect(nextFullContentRetryAt(MAX_FULL_CONTENT_ATTEMPTS, now)).toBeNull();
  });

  it("never retries before a publisher's Retry-After time", () => {
    const retryAfter = new Date("2026-07-19T14:00:00.000Z");
    expect(nextFullContentRetryAt(1, now, retryAfter)).toEqual(retryAfter);
  });

  it("recognizes only supported durable states", () => {
    expect(isFullContentStatus("ready")).toBe(true);
    expect(isFullContentStatus("not_a_real_status")).toBe(false);
  });

  it("uses a finite lease for abandoned worker claims", () => {
    expect(FULL_CONTENT_LOCK_MS).toBe(600_000);
  });
});
