export const MAX_SAVED_PAGE_EXTRACTION_ATTEMPTS = 5;

/** How long a claimed extraction may run before another worker may reclaim it. */
export const SAVED_PAGE_EXTRACTION_LOCK_MS = 10 * 60_000;

// A reader saved this link and may be watching it right now, so the first
// retries are quick; the scheduler ticks once a minute, which is the real floor.
// Later delays exist only so a persistently broken publisher stops costing
// requests, not because a copy hours later is still useful.
const RETRY_DELAYS_MS = [1, 5, 30, 120].map((minutes) => minutes * 60_000);

/**
 * When a failed saved-page extraction should be tried again, or null when the
 * failure is terminal. `attempts` is the count after the failed attempt, as
 * returned by the claim. A publisher's own Retry-After is never undercut.
 */
export function nextSavedPageRetryAt(
  attempts: number,
  now = new Date(),
  retryAfterAt?: Date | null,
): Date | null {
  if (attempts >= MAX_SAVED_PAGE_EXTRACTION_ATTEMPTS) return null;
  const delay =
    RETRY_DELAYS_MS[Math.max(0, attempts - 1)] ??
    RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const localRetry = new Date(now.getTime() + (delay ?? 120 * 60_000));
  if (retryAfterAt && retryAfterAt.getTime() > localRetry.getTime()) {
    return retryAfterAt;
  }
  return localRetry;
}
