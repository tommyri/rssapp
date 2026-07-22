import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { nativeAppSessions, nativeAppSessionTokens, users } from "@/db/schema";

const SECRET_BYTES = 32;
const ACCESS_PREFIX = "currentfold_access_";
const REFRESH_PREFIX = "currentfold_refresh_";
const SECRET_SUFFIX_PATTERN = "[A-Za-z0-9_-]{43}";
const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export interface NativeAppAccount {
  id: number;
  email: string;
  displayName: string | null;
}

export interface NativeAppTokenPair {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface NativeAppSessionGrant {
  account: NativeAppAccount;
  tokens: NativeAppTokenPair;
}

export interface NativeAppPrincipal extends NativeAppAccount {
  sessionId: string;
}

export interface ActiveNativeAppSession {
  id: string;
  deviceName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export function normalizeNativeDeviceName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "Currentfold for iOS";
  return normalized.slice(0, 100);
}

function createSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function createSecret(prefix: string): string {
  return `${prefix}${randomBytes(SECRET_BYTES).toString("base64url")}`;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function matchesSecret(secret: string, prefix: string): boolean {
  return new RegExp(`^${prefix}${SECRET_SUFFIX_PATTERN}$`).test(secret);
}

export function isNativeAccessToken(secret: string): boolean {
  return matchesSecret(secret, ACCESS_PREFIX);
}

export function isNativeRefreshToken(secret: string): boolean {
  return matchesSecret(secret, REFRESH_PREFIX);
}

function newTokenPair(now: Date, sessionExpiresAt: Date): NativeAppTokenPair {
  return {
    accessToken: createSecret(ACCESS_PREFIX),
    accessTokenExpiresAt: new Date(
      Math.min(now.getTime() + ACCESS_TTL_MS, sessionExpiresAt.getTime()),
    ),
    refreshToken: createSecret(REFRESH_PREFIX),
    refreshTokenExpiresAt: new Date(
      Math.min(now.getTime() + REFRESH_IDLE_TTL_MS, sessionExpiresAt.getTime()),
    ),
  };
}

async function insertTokenPair(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
  tokens: NativeAppTokenPair,
): Promise<void> {
  await tx.insert(nativeAppSessionTokens).values([
    {
      sessionId,
      kind: "access",
      tokenHash: hashSecret(tokens.accessToken),
      expiresAt: tokens.accessTokenExpiresAt,
    },
    {
      sessionId,
      kind: "refresh",
      tokenHash: hashSecret(tokens.refreshToken),
      expiresAt: tokens.refreshTokenExpiresAt,
    },
  ]);
}

/** Create a device session and return its raw credentials exactly once. */
export async function createNativeAppSession({
  user,
  deviceName,
  now = new Date(),
}: {
  user: NativeAppAccount & { sessionVersion: number };
  deviceName: string;
  now?: Date;
}): Promise<NativeAppSessionGrant> {
  const sessionId = createSessionId();
  const sessionExpiresAt = new Date(now.getTime() + SESSION_MAX_AGE_MS);
  const tokens = newTokenPair(now, sessionExpiresAt);

  await db.transaction(async (tx) => {
    await tx
      .delete(nativeAppSessions)
      .where(
        and(
          eq(nativeAppSessions.userId, user.id),
          or(
            lt(nativeAppSessions.expiresAt, now),
            isNotNull(nativeAppSessions.revokedAt),
          ),
        ),
      );
    await tx.insert(nativeAppSessions).values({
      id: sessionId,
      userId: user.id,
      sessionVersion: user.sessionVersion,
      deviceName: normalizeNativeDeviceName(deviceName),
      expiresAt: sessionExpiresAt,
      lastUsedAt: now,
    });
    await insertTokenPair(tx, sessionId, tokens);
  });

  return {
    account: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    tokens,
  };
}

/**
 * Exchange one refresh token exactly once. Access credentials from the prior
 * generation are consumed in the same transaction, so a successful rotation
 * leaves only one usable credential pair for this device.
 */
export async function rotateNativeAppSession(
  refreshToken: string,
  now = new Date(),
): Promise<NativeAppSessionGrant | null> {
  if (!isNativeRefreshToken(refreshToken)) return null;
  const tokenHash = hashSecret(refreshToken);

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        tokenId: nativeAppSessionTokens.id,
        tokenKind: nativeAppSessionTokens.kind,
        tokenExpiresAt: nativeAppSessionTokens.expiresAt,
        tokenConsumedAt: nativeAppSessionTokens.consumedAt,
        sessionId: nativeAppSessions.id,
        sessionVersion: nativeAppSessions.sessionVersion,
        sessionExpiresAt: nativeAppSessions.expiresAt,
        sessionRevokedAt: nativeAppSessions.revokedAt,
        accountId: users.id,
        accountEmail: users.email,
        accountDisplayName: users.displayName,
        accountSessionVersion: users.sessionVersion,
        accountStatus: users.status,
      })
      .from(nativeAppSessionTokens)
      .innerJoin(
        nativeAppSessions,
        eq(nativeAppSessions.id, nativeAppSessionTokens.sessionId),
      )
      .innerJoin(users, eq(users.id, nativeAppSessions.userId))
      .where(eq(nativeAppSessionTokens.tokenHash, tokenHash))
      .for("update");

    if (!record || record.tokenKind !== "refresh") return null;
    if (
      record.tokenConsumedAt ||
      record.tokenExpiresAt <= now ||
      record.sessionRevokedAt ||
      record.sessionExpiresAt <= now ||
      record.accountStatus !== "active" ||
      record.accountSessionVersion !== record.sessionVersion
    ) {
      return null;
    }

    await tx
      .update(nativeAppSessionTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(nativeAppSessionTokens.sessionId, record.sessionId),
          isNull(nativeAppSessionTokens.consumedAt),
        ),
      );

    const tokens = newTokenPair(now, record.sessionExpiresAt);
    await insertTokenPair(tx, record.sessionId, tokens);
    await tx
      .update(nativeAppSessions)
      .set({ lastUsedAt: now })
      .where(eq(nativeAppSessions.id, record.sessionId));

    return {
      account: {
        id: record.accountId,
        email: record.accountEmail,
        displayName: record.accountDisplayName,
      },
      tokens,
    };
  });
}

/** Resolve a short-lived native access token to an active account and device. */
export async function authenticateNativeAccessToken(
  accessToken: string,
  now = new Date(),
): Promise<NativeAppPrincipal | null> {
  if (!isNativeAccessToken(accessToken)) return null;

  const [record] = await db
    .select({
      sessionId: nativeAppSessions.id,
      lastUsedAt: nativeAppSessions.lastUsedAt,
      account: {
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      },
    })
    .from(nativeAppSessionTokens)
    .innerJoin(
      nativeAppSessions,
      and(
        eq(nativeAppSessions.id, nativeAppSessionTokens.sessionId),
        isNull(nativeAppSessions.revokedAt),
        gt(nativeAppSessions.expiresAt, now),
      ),
    )
    .innerJoin(
      users,
      and(
        eq(users.id, nativeAppSessions.userId),
        eq(users.status, "active"),
        eq(users.sessionVersion, nativeAppSessions.sessionVersion),
      ),
    )
    .where(
      and(
        eq(nativeAppSessionTokens.kind, "access"),
        eq(nativeAppSessionTokens.tokenHash, hashSecret(accessToken)),
        isNull(nativeAppSessionTokens.consumedAt),
        gt(nativeAppSessionTokens.expiresAt, now),
      ),
    );
  if (!record) return null;

  if (
    !record.lastUsedAt ||
    now.getTime() - record.lastUsedAt.getTime() >= LAST_USED_WRITE_INTERVAL_MS
  ) {
    await db
      .update(nativeAppSessions)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(nativeAppSessions.id, record.sessionId),
          isNull(nativeAppSessions.revokedAt),
        ),
      );
  }

  return { ...record.account, sessionId: record.sessionId };
}

export async function revokeNativeAppSession(
  principal: NativeAppPrincipal,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(nativeAppSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(nativeAppSessions.id, principal.sessionId),
          eq(nativeAppSessions.userId, principal.id),
          isNull(nativeAppSessions.revokedAt),
        ),
      );
    await tx
      .update(nativeAppSessionTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(nativeAppSessionTokens.sessionId, principal.sessionId),
          isNull(nativeAppSessionTokens.consumedAt),
        ),
      );
  });
}

export async function listActiveNativeAppSessions({
  userId,
  sessionVersion,
  now = new Date(),
}: {
  userId: number;
  sessionVersion: number;
  now?: Date;
}): Promise<ActiveNativeAppSession[]> {
  return db
    .select({
      id: nativeAppSessions.id,
      deviceName: nativeAppSessions.deviceName,
      createdAt: nativeAppSessions.createdAt,
      lastUsedAt: nativeAppSessions.lastUsedAt,
    })
    .from(nativeAppSessions)
    .where(
      and(
        eq(nativeAppSessions.userId, userId),
        eq(nativeAppSessions.sessionVersion, sessionVersion),
        isNull(nativeAppSessions.revokedAt),
        gt(nativeAppSessions.expiresAt, now),
      ),
    )
    .orderBy(
      desc(nativeAppSessions.lastUsedAt),
      desc(nativeAppSessions.createdAt),
    );
}

export async function revokeNativeAppSessionById({
  id,
  userId,
  sessionVersion,
  now = new Date(),
}: {
  id: string;
  userId: number;
  sessionVersion: number;
  now?: Date;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [session] = await tx
      .update(nativeAppSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(nativeAppSessions.id, id),
          eq(nativeAppSessions.userId, userId),
          eq(nativeAppSessions.sessionVersion, sessionVersion),
          isNull(nativeAppSessions.revokedAt),
        ),
      )
      .returning({ id: nativeAppSessions.id });
    if (!session) return false;

    await tx
      .update(nativeAppSessionTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(nativeAppSessionTokens.sessionId, session.id),
          isNull(nativeAppSessionTokens.consumedAt),
        ),
      );
    return true;
  });
}

export async function revokeAllNativeAppSessions({
  userId,
  sessionVersion,
  now = new Date(),
}: {
  userId: number;
  sessionVersion: number;
  now?: Date;
}): Promise<number> {
  return db.transaction(async (tx) => {
    const revoked = await tx
      .update(nativeAppSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(nativeAppSessions.userId, userId),
          eq(nativeAppSessions.sessionVersion, sessionVersion),
          isNull(nativeAppSessions.revokedAt),
          gt(nativeAppSessions.expiresAt, now),
        ),
      )
      .returning({ id: nativeAppSessions.id });
    if (!revoked.length) return 0;

    for (const session of revoked) {
      await tx
        .update(nativeAppSessionTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(nativeAppSessionTokens.sessionId, session.id),
            isNull(nativeAppSessionTokens.consumedAt),
          ),
        );
    }
    return revoked.length;
  });
}
