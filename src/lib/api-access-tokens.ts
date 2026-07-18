import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiAccessTokens, users } from "@/db/schema";

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = "rssapp_api_";
const DISPLAY_PREFIX_CHARS = 8;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export interface ApiAccessTokenSummary {
  id: number;
  name: string;
  tokenPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface ApiAccessTokenPrincipal {
  id: number;
  email: string;
  displayName: string | null;
}

/** Keep device labels concise and useful in the Settings security surface. */
export function normalizeApiAccessTokenName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 80 ? name : null;
}

export function createApiAccessTokenSecret(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

export function isApiAccessTokenSecret(value: string): boolean {
  return new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`).test(value);
}

export function hashApiAccessToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function apiAccessTokenDisplayPrefix(value: string): string {
  return `${TOKEN_PREFIX}${value.slice(
    TOKEN_PREFIX.length,
    TOKEN_PREFIX.length + DISPLAY_PREFIX_CHARS,
  )}…`;
}

export async function listApiAccessTokens(
  userId: number,
): Promise<ApiAccessTokenSummary[]> {
  return db
    .select({
      id: apiAccessTokens.id,
      name: apiAccessTokens.name,
      tokenPrefix: apiAccessTokens.tokenPrefix,
      createdAt: apiAccessTokens.createdAt,
      lastUsedAt: apiAccessTokens.lastUsedAt,
    })
    .from(apiAccessTokens)
    .where(
      and(
        eq(apiAccessTokens.userId, userId),
        isNull(apiAccessTokens.revokedAt),
      ),
    )
    .orderBy(desc(apiAccessTokens.createdAt));
}

/**
 * The secret is intentionally returned exactly once. Callers must show it to
 * the user immediately and never persist it in a browser session or database.
 */
export async function createApiAccessToken({
  userId,
  name,
}: {
  userId: number;
  name: string;
}): Promise<{ token: ApiAccessTokenSummary; secret: string }> {
  const secret = createApiAccessTokenSecret();
  const [token] = await db
    .insert(apiAccessTokens)
    .values({
      userId,
      name,
      tokenHash: hashApiAccessToken(secret),
      tokenPrefix: apiAccessTokenDisplayPrefix(secret),
    })
    .returning({
      id: apiAccessTokens.id,
      name: apiAccessTokens.name,
      tokenPrefix: apiAccessTokens.tokenPrefix,
      createdAt: apiAccessTokens.createdAt,
      lastUsedAt: apiAccessTokens.lastUsedAt,
    });
  if (!token) throw new Error("Could not create an API access token.");
  return { token, secret };
}

export async function revokeApiAccessToken({
  userId,
  tokenId,
}: {
  userId: number;
  tokenId: number;
}): Promise<boolean> {
  const [token] = await db
    .update(apiAccessTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiAccessTokens.id, tokenId),
        eq(apiAccessTokens.userId, userId),
        isNull(apiAccessTokens.revokedAt),
      ),
    )
    .returning({ id: apiAccessTokens.id });
  return Boolean(token);
}

/**
 * Resolves only active credentials belonging to an active account. Usage is
 * written at most once every five minutes, so a frequent background sync does
 * not turn reads into a continuous stream of Postgres writes.
 */
export async function authenticateApiAccessToken(
  secret: string,
): Promise<ApiAccessTokenPrincipal | null> {
  if (!isApiAccessTokenSecret(secret)) return null;

  const [result] = await db
    .select({
      tokenId: apiAccessTokens.id,
      lastUsedAt: apiAccessTokens.lastUsedAt,
      user: {
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      },
    })
    .from(apiAccessTokens)
    .innerJoin(users, eq(users.id, apiAccessTokens.userId))
    .where(
      and(
        eq(apiAccessTokens.tokenHash, hashApiAccessToken(secret)),
        isNull(apiAccessTokens.revokedAt),
        eq(users.status, "active"),
      ),
    );
  if (!result) return null;

  const now = new Date();
  if (
    !result.lastUsedAt ||
    now.getTime() - result.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS
  ) {
    await db
      .update(apiAccessTokens)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiAccessTokens.id, result.tokenId),
          isNull(apiAccessTokens.revokedAt),
        ),
      );
  }

  return result.user;
}
