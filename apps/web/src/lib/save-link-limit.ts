import { AUTH_RATE_LIMITS, consumeAuthRateLimit } from "@/lib/auth-rate-limit";

/**
 * Server-only: this reaches the durable counter table, so nothing rendered in
 * the browser may import it. Reader-facing strings live in save-link-notice.ts.
 *
 * Spend one save from an account's budget, returning false when it is used up.
 *
 * Both ways of saving a link share this budget on purpose: the bookmark's
 * `GET /save` and the paste-a-URL action do the same work — store a row and
 * fetch a URL the account holder chose — so limiting one and not the other
 * would just move an abuser to the cheaper path.
 */
export async function consumeSaveLinkBudget(userId: number): Promise<boolean> {
  const { limited } = await consumeAuthRateLimit(
    AUTH_RATE_LIMITS.saveLink,
    `user:${userId}`,
  );
  return !limited;
}
