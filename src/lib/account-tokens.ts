import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { type AccountTokenKind, accountTokens, users } from "@/db/schema";

const TOKEN_BYTES = 32;

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
}): Promise<string> {
  const secret = createAccountTokenSecret();
  const now = new Date();

  await db.transaction(async (tx) => {
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

    await tx.insert(accountTokens).values({
      userId,
      kind,
      email: normalizeAccountEmail(email),
      tokenHash: hashAccountToken(secret),
      expiresAt: new Date(now.getTime() + ACCOUNT_TOKEN_TTLS[kind]),
    });
  });

  return secret;
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
