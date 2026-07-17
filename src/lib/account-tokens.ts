import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { type AccountTokenKind, accountTokens, users } from "@/db/schema";

const TOKEN_BYTES = 32;

/** Avoid repeatedly sending the same account email while keeping recovery quick. */
export const ACCOUNT_EMAIL_COOLDOWN_MS = 60 * 1000;

export const ACCOUNT_TOKEN_TTLS: Record<AccountTokenKind, number> = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
  email_change: 60 * 60 * 1000,
};

export function createAccountTokenSecret(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isAccountTokenSecret(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashAccountToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeAccountEmail(value: string): string {
  return value.toLowerCase().trim();
}

export function accountEmailRetryAfterSeconds(
  createdAt: Date,
  now = new Date(),
): number {
  return Math.max(
    0,
    Math.ceil(
      (createdAt.getTime() + ACCOUNT_EMAIL_COOLDOWN_MS - now.getTime()) / 1000,
    ),
  );
}

export class AccountTokenCooldownError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("An account email was sent recently.");
    this.name = "AccountTokenCooldownError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface IssuedAccountToken {
  id: number;
  secret: string;
}

/**
 * Creates a replacement one-time token. Issuing another link intentionally
 * invalidates every unused link of the same kind for that account.
 */
export async function issueAccountToken({
  userId,
  kind,
  email,
}: {
  userId: number;
  kind: AccountTokenKind;
  email: string;
}): Promise<IssuedAccountToken> {
  const secret = createAccountTokenSecret();
  const now = new Date();

  const tokenId = await db.transaction(async (tx) => {
    // Serializing on the user row makes concurrent resend requests observe the
    // same recent token instead of both sending an email.
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    const [latestToken] = await tx
      .select({ createdAt: accountTokens.createdAt })
      .from(accountTokens)
      .where(
        and(
          eq(accountTokens.userId, userId),
          eq(accountTokens.kind, kind),
          isNull(accountTokens.usedAt),
        ),
      )
      .orderBy(desc(accountTokens.createdAt))
      .limit(1);
    if (latestToken) {
      const retryAfterSeconds = accountEmailRetryAfterSeconds(
        latestToken.createdAt,
        now,
      );
      if (retryAfterSeconds > 0) {
        throw new AccountTokenCooldownError(retryAfterSeconds);
      }
    }

    await tx
      .update(accountTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(accountTokens.userId, userId),
          eq(accountTokens.kind, kind),
          isNull(accountTokens.usedAt),
        ),
      );

    const [token] = await tx
      .insert(accountTokens)
      .values({
        userId,
        kind,
        email: normalizeAccountEmail(email),
        tokenHash: hashAccountToken(secret),
        expiresAt: new Date(now.getTime() + ACCOUNT_TOKEN_TTLS[kind]),
      })
      .returning({ id: accountTokens.id });
    if (!token) throw new Error("Could not create account token.");
    return token.id;
  });

  return { id: tokenId, secret };
}

/**
 * If delivery fails, discard the unsent link so a person can retry immediately
 * instead of waiting through the resend cooldown.
 */
export async function revokeAccountToken({
  id,
  userId,
  kind,
}: {
  id: number;
  userId: number;
  kind: AccountTokenKind;
}): Promise<void> {
  await db
    .update(accountTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(accountTokens.id, id),
        eq(accountTokens.userId, userId),
        eq(accountTokens.kind, kind),
        isNull(accountTokens.usedAt),
      ),
    );
}

export interface ConsumedAccountToken {
  userId: number;
  email: string;
}

/**
 * Atomically marks a valid token used. A stale, malformed, expired, or already
 * used token is intentionally indistinguishable to callers.
 */
export async function consumeAccountToken(
  secret: string,
  kind: AccountTokenKind,
): Promise<ConsumedAccountToken | null> {
  if (!isAccountTokenSecret(secret)) return null;

  const now = new Date();
  const [token] = await db
    .update(accountTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(accountTokens.kind, kind),
        eq(accountTokens.tokenHash, hashAccountToken(secret)),
        isNull(accountTokens.usedAt),
        gt(accountTokens.expiresAt, now),
      ),
    )
    .returning({ userId: accountTokens.userId, email: accountTokens.email });

  return token ?? null;
}

export async function activeUserForAccountToken(userId: number) {
  return db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.status, "active")),
  });
}
