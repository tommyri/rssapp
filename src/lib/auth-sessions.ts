import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { authSessions } from "@/db/schema";
import { AUTH_SESSION_MAX_AGE_MS } from "@/lib/auth-session-config";

const AUTH_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface ActiveAuthSession {
  id: string;
  createdAt: Date;
}

export function isAuthSessionId(value: unknown): value is string {
  return typeof value === "string" && AUTH_SESSION_ID_PATTERN.test(value);
}

export function authSessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + AUTH_SESSION_MAX_AGE_MS);
}

/**
 * Store a server-verifiable handle alongside the signed JWT. The handle is
 * opaque, rotates on every sign-in, and lets a person revoke one browser
 * session without invalidating the rest of their account.
 */
export async function createAuthSession({
  userId,
  sessionVersion,
}: {
  userId: number;
  sessionVersion: number;
}): Promise<string> {
  const now = new Date();
  const id = randomBytes(32).toString("base64url");

  await db.transaction(async (tx) => {
    // Expired and previously revoked records have no product value. Clearing
    // them here keeps the per-account session list bounded without a cron job.
    await tx
      .delete(authSessions)
      .where(
        and(
          eq(authSessions.userId, userId),
          or(
            lt(authSessions.expiresAt, now),
            isNotNull(authSessions.revokedAt),
          ),
        ),
      );
    await tx.insert(authSessions).values({
      id,
      userId,
      sessionVersion,
      expiresAt: authSessionExpiresAt(now),
    });
  });

  return id;
}

export async function listActiveAuthSessions({
  userId,
  sessionVersion,
}: {
  userId: number;
  sessionVersion: number;
}): Promise<ActiveAuthSession[]> {
  return db
    .select({ id: authSessions.id, createdAt: authSessions.createdAt })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.userId, userId),
        eq(authSessions.sessionVersion, sessionVersion),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(authSessions.createdAt));
}

export async function revokeAuthSession({
  id,
  userId,
  sessionVersion,
}: {
  id: string;
  userId: number;
  sessionVersion: number;
}): Promise<boolean> {
  if (!isAuthSessionId(id)) return false;
  const [revoked] = await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(authSessions.id, id),
        eq(authSessions.userId, userId),
        eq(authSessions.sessionVersion, sessionVersion),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .returning({ id: authSessions.id });
  return Boolean(revoked);
}

/** Used only during an ordinary sign-out, where the opaque id came from JWT. */
export async function revokeAuthSessionById(id: string): Promise<void> {
  if (!isAuthSessionId(id)) return;
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)));
}

export async function revokeOtherAuthSessions({
  currentSessionId,
  userId,
  sessionVersion,
}: {
  currentSessionId: string;
  userId: number;
  sessionVersion: number;
}): Promise<number> {
  if (!isAuthSessionId(currentSessionId)) return 0;
  const revoked = await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(authSessions.userId, userId),
        eq(authSessions.sessionVersion, sessionVersion),
        ne(authSessions.id, currentSessionId),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .returning({ id: authSessions.id });
  return revoked.length;
}
