import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { authRateLimits } from "@/db/schema";

export interface AuthRateLimitPolicy {
  bucket: string;
  maxAttempts: number;
  windowMs: number;
}

export interface AuthRateLimitTarget {
  policy: AuthRateLimitPolicy;
  key: string;
}

export const AUTH_RATE_LIMITS = {
  signInEmail: {
    bucket: "sign_in_email",
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000,
  },
  signInNetwork: {
    bucket: "sign_in_network",
    maxAttempts: 30,
    windowMs: 15 * 60 * 1000,
  },
  providerChallengeNetwork: {
    bucket: "provider_challenge_network",
    maxAttempts: 30,
    windowMs: 15 * 60 * 1000,
  },
  signUpEmail: {
    bucket: "sign_up_email",
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,
  },
  signUpNetwork: {
    bucket: "sign_up_network",
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000,
  },
  recoveryEmail: {
    bucket: "recovery_email",
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
  },
  recoveryNetwork: {
    bucket: "recovery_network",
    maxAttempts: 20,
    windowMs: 60 * 60 * 1000,
  },
} as const satisfies Record<string, AuthRateLimitPolicy>;

export interface AuthRateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

function rateLimitSecret(): string {
  return process.env.AUTH_SECRET ?? "rssapp-development-rate-limit-secret";
}

export function hashAuthRateLimitKey(bucket: string, key: string): string {
  return createHash("sha256")
    .update(`${rateLimitSecret()}:${bucket}:${key}`)
    .digest("hex");
}

export function rateLimitRetryAfterSeconds(
  windowStartedAt: Date,
  windowMs: number,
  now = new Date(),
): number {
  return Math.max(
    1,
    Math.ceil((windowStartedAt.getTime() + windowMs - now.getTime()) / 1000),
  );
}

export function emailRateLimitKey(email: string): string {
  return `email:${email.toLowerCase().trim()}`;
}

export function networkRateLimitKeyFromHeaders(
  requestHeaders: Headers,
): string | null {
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const network =
    forwarded ||
    requestHeaders.get("x-real-ip")?.trim() ||
    requestHeaders.get("cf-connecting-ip")?.trim();
  return network ? `network:${network}` : null;
}

/**
 * Reverse proxies normally provide one of these headers. If none is present,
 * email-key limits still protect the endpoint without grouping every direct
 * connection into one destructive shared bucket.
 */
export async function requestNetworkRateLimitKey(): Promise<string | null> {
  return networkRateLimitKeyFromHeaders(await headers());
}

function limitResult(
  attempts: number,
  windowStartedAt: Date,
  policy: AuthRateLimitPolicy,
  now: Date,
  blockNextAttempt = false,
): AuthRateLimitResult {
  return {
    // A preflight check must block the request after exactly the configured
    // number of failures. A consuming request is allowed to be that final
    // attempt, so it only reports limited once it exceeds the budget.
    limited: blockNextAttempt
      ? attempts >= policy.maxAttempts
      : attempts > policy.maxAttempts,
    retryAfterSeconds: rateLimitRetryAfterSeconds(
      windowStartedAt,
      policy.windowMs,
      now,
    ),
  };
}

/** Check a failed-login bucket without counting a successful sign-in attempt. */
export async function checkAuthRateLimit(
  policy: AuthRateLimitPolicy,
  key: string,
  now = new Date(),
): Promise<AuthRateLimitResult> {
  const [limit] = await db
    .select({
      attempts: authRateLimits.attempts,
      windowStartedAt: authRateLimits.windowStartedAt,
    })
    .from(authRateLimits)
    .where(
      and(
        eq(authRateLimits.bucket, policy.bucket),
        eq(authRateLimits.keyHash, hashAuthRateLimitKey(policy.bucket, key)),
      ),
    );
  if (
    !limit ||
    limit.windowStartedAt.getTime() + policy.windowMs <= now.getTime()
  ) {
    return { limited: false, retryAfterSeconds: 0 };
  }
  return limitResult(limit.attempts, limit.windowStartedAt, policy, now, true);
}

/**
 * Atomically increments an anonymous endpoint's counter. A per-bucket/key
 * advisory lock avoids a read/insert race without storing the source value.
 */
export async function consumeAuthRateLimit(
  policy: AuthRateLimitPolicy,
  key: string,
  now = new Date(),
): Promise<AuthRateLimitResult> {
  const keyHash = hashAuthRateLimitKey(policy.bucket, key);
  const expiredBefore = new Date(now.getTime() - policy.windowMs);

  return db.transaction(async (tx) => {
    await tx
      .delete(authRateLimits)
      .where(
        lt(
          authRateLimits.updatedAt,
          new Date(now.getTime() - 24 * 60 * 60 * 1000),
        ),
      );
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${policy.bucket}:${keyHash}`}))`,
    );
    const [existing] = await tx
      .select({
        attempts: authRateLimits.attempts,
        windowStartedAt: authRateLimits.windowStartedAt,
      })
      .from(authRateLimits)
      .where(
        and(
          eq(authRateLimits.bucket, policy.bucket),
          eq(authRateLimits.keyHash, keyHash),
        ),
      )
      .for("update");

    if (!existing) {
      await tx.insert(authRateLimits).values({
        bucket: policy.bucket,
        keyHash,
        windowStartedAt: now,
        attempts: 1,
        updatedAt: now,
      });
      return { limited: false, retryAfterSeconds: 0 };
    }

    if (existing.windowStartedAt < expiredBefore) {
      await tx
        .update(authRateLimits)
        .set({ attempts: 1, windowStartedAt: now, updatedAt: now })
        .where(
          and(
            eq(authRateLimits.bucket, policy.bucket),
            eq(authRateLimits.keyHash, keyHash),
          ),
        );
      return { limited: false, retryAfterSeconds: 0 };
    }

    const attempts = existing.attempts + 1;
    await tx
      .update(authRateLimits)
      .set({ attempts, updatedAt: now })
      .where(
        and(
          eq(authRateLimits.bucket, policy.bucket),
          eq(authRateLimits.keyHash, keyHash),
        ),
      );
    return limitResult(attempts, existing.windowStartedAt, policy, now);
  });
}

export async function checkAuthRateLimits(
  targets: AuthRateLimitTarget[],
): Promise<AuthRateLimitResult> {
  const results = await Promise.all(
    targets.map(({ policy, key }) => checkAuthRateLimit(policy, key)),
  );
  return (
    results.find((result) => result.limited) ?? {
      limited: false,
      retryAfterSeconds: 0,
    }
  );
}

export async function consumeAuthRateLimits(
  targets: AuthRateLimitTarget[],
): Promise<AuthRateLimitResult> {
  const results = await Promise.all(
    targets.map(({ policy, key }) => consumeAuthRateLimit(policy, key)),
  );
  return (
    results.find((result) => result.limited) ?? {
      limited: false,
      retryAfterSeconds: 0,
    }
  );
}

export async function clearAuthRateLimit(
  policy: AuthRateLimitPolicy,
  key: string,
): Promise<void> {
  await db
    .delete(authRateLimits)
    .where(
      and(
        eq(authRateLimits.bucket, policy.bucket),
        eq(authRateLimits.keyHash, hashAuthRateLimitKey(policy.bucket, key)),
      ),
    );
}

/** Keep anonymous-counter storage bounded without retaining old source hashes. */
