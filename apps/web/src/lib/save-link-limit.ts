import {
  AUTH_RATE_LIMITS,
  type AuthRateLimitResult,
  consumeAuthRateLimit,
} from "@/lib/auth-rate-limit";

/**
 * Server-only: this reaches the durable counter table, so nothing rendered in
 * the browser may import it. Reader-facing strings live in save-link-notice.ts.
 *
 * Spend one save from an account's budget and report how long a client should
 * wait when it is used up. The web surfaces this as a sentence and has nowhere
 * to put a delay; an API client can honour one, so the number is not discarded
 * here.
 *
 * Every way of saving a link shares this budget on purpose: the bookmark's
 * `GET /save`, the paste-a-URL action, and the first-party API all do the same
 * work — store a row and fetch a URL the account holder chose — so limiting one
 * and not the others would just move an abuser to the cheapest path.
 */
export async function spendSaveLinkBudget(
  userId: number,
): Promise<AuthRateLimitResult> {
  return consumeAuthRateLimit(AUTH_RATE_LIMITS.saveLink, `user:${userId}`);
}

/** Spend one save from an account's budget, returning false when it is used up. */
export async function consumeSaveLinkBudget(userId: number): Promise<boolean> {
  const { limited } = await spendSaveLinkBudget(userId);
  return !limited;
}
