export const FULL_CONTENT_STATUSES = [
  "not_needed",
  "pending",
  "processing",
  "ready",
  "retrying",
  "unavailable",
] as const;

export type FullContentStatus = (typeof FULL_CONTENT_STATUSES)[number];

export const MAX_FULL_CONTENT_ATTEMPTS = 5;
export const FULL_CONTENT_LOCK_MS = 10 * 60_000;

const RETRY_DELAYS_MS = [5, 30, 2 * 60, 12 * 60, 24 * 60].map(
  (minutes) => minutes * 60_000,
);

/**
 * A failed claim has already incremented attempts. Return null for a terminal
 * failure; otherwise respect an upstream Retry-After without retrying sooner.
 */
export function nextFullContentRetryAt(
  attempts: number,
  now = new Date(),
  retryAfterAt?: Date | null,
): Date | null {
  if (attempts >= MAX_FULL_CONTENT_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[Math.max(0, attempts - 1)] ?? 24 * 60 * 60_000;
  const localRetry = new Date(now.getTime() + delay);
  if (retryAfterAt && retryAfterAt.getTime() > localRetry.getTime()) {
    return retryAfterAt;
  }
  return localRetry;
}

export function isFullContentStatus(
  value: unknown,
): value is FullContentStatus {
  return (
    typeof value === "string" &&
    (FULL_CONTENT_STATUSES as readonly string[]).includes(value)
  );
}
