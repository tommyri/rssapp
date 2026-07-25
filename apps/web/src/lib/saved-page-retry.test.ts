import { describe, expect, it } from "vitest";
import {
  MAX_SAVED_PAGE_EXTRACTION_ATTEMPTS,
  nextSavedPageRetryAt,
} from "./saved-page-retry";

const now = new Date("2026-07-25T12:00:00.000Z");

describe("saved-page extraction retry schedule", () => {
  it("backs off further with each failed attempt", () => {
    const delays = [1, 2, 3, 4].map((attempts) => {
      const at = nextSavedPageRetryAt(attempts, now);
      return at === null ? null : at.getTime() - now.getTime();
    });

    expect(delays).toEqual([60_000, 300_000, 1_800_000, 7_200_000]);
  });

  it("gives up once the attempt budget is spent", () => {
    expect(
      nextSavedPageRetryAt(MAX_SAVED_PAGE_EXTRACTION_ATTEMPTS, now),
    ).toBeNull();
    expect(
      nextSavedPageRetryAt(MAX_SAVED_PAGE_EXTRACTION_ATTEMPTS + 3, now),
    ).toBeNull();
  });

  it("never retries sooner than a publisher's Retry-After", () => {
    const retryAfterAt = new Date(now.getTime() + 45 * 60_000);

    expect(nextSavedPageRetryAt(1, now, retryAfterAt)).toEqual(retryAfterAt);
  });

  it("ignores a Retry-After that is sooner than our own backoff", () => {
    const retryAfterAt = new Date(now.getTime() + 1_000);

    expect(nextSavedPageRetryAt(2, now, retryAfterAt)?.getTime()).toBe(
      now.getTime() + 300_000,
    );
  });

  it("treats a first attempt and a zeroth the same", () => {
    // The claim increments before extracting, so 0 should not be reachable —
    // but it must not produce an immediate, unbounded retry if it ever is.
    expect(nextSavedPageRetryAt(0, now)?.getTime()).toBe(
      now.getTime() + 60_000,
    );
  });
});
