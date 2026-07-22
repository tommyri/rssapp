import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { bearerCredential } from "@/lib/api-v1-auth";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimits,
  clearAuthRateLimit,
  consumeAuthRateLimits,
  emailRateLimitKey,
  networkRateLimitKeyFromHeaders,
} from "@/lib/auth-rate-limit";
import {
  authenticateNativeAccessToken,
  createNativeAppSession,
  revokeNativeAppSession,
} from "@/lib/native-app-sessions";
import { nativeSessionResponse } from "@/lib/native-auth-response";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const signInSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(1024),
    deviceName: z.string().trim().max(100).optional().default(""),
  })
  .strict();

export async function POST(request: Request) {
  const parsed = signInSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return apiError(
      "invalid_request",
      "Enter a valid email address and password.",
      400,
    );
  }

  const networkKey = networkRateLimitKeyFromHeaders(request.headers);
  const targets = [
    {
      policy: AUTH_RATE_LIMITS.signInEmail,
      key: emailRateLimitKey(parsed.data.email),
    },
    ...(networkKey
      ? [{ policy: AUTH_RATE_LIMITS.signInNetwork, key: networkKey }]
      : []),
  ];
  const currentLimit = await checkAuthRateLimits(targets);
  if (currentLimit.limited) {
    return apiError(
      "rate_limited",
      `Too many sign-in attempts. Try again in ${currentLimit.retryAfterSeconds} seconds.`,
      429,
      { "retry-after": String(currentLimit.retryAfterSeconds) },
    );
  }

  const user = await db.query.users.findFirst({
    columns: {
      id: true,
      email: true,
      displayName: true,
      passwordHash: true,
      emailVerifiedAt: true,
      sessionVersion: true,
    },
    where: and(eq(users.email, parsed.data.email), eq(users.status, "active")),
  });

  if (
    !user?.passwordHash ||
    !verifyPassword(parsed.data.password, user.passwordHash)
  ) {
    const nextLimit = await consumeAuthRateLimits(targets);
    if (nextLimit.limited) {
      return apiError(
        "rate_limited",
        `Too many sign-in attempts. Try again in ${nextLimit.retryAfterSeconds} seconds.`,
        429,
        { "retry-after": String(nextLimit.retryAfterSeconds) },
      );
    }
    return apiError("invalid_credentials", "Invalid email or password.", 401);
  }

  if (!user.emailVerifiedAt) {
    return apiError(
      "email_unverified",
      "Verify your email address before signing in.",
      403,
    );
  }

  await Promise.all([
    clearAuthRateLimit(
      AUTH_RATE_LIMITS.signInEmail,
      emailRateLimitKey(user.email),
    ),
    db
      .update(users)
      .set({ lastSignedInAt: new Date() })
      .where(eq(users.id, user.id)),
  ]);
  const grant = await createNativeAppSession({
    user,
    deviceName: parsed.data.deviceName,
  });
  return apiJson(nativeSessionResponse(grant));
}

export async function DELETE(request: Request) {
  const credential = bearerCredential(request.headers.get("authorization"));
  if (!credential) {
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  }
  const principal = credential
    ? await authenticateNativeAccessToken(credential)
    : null;
  if (!principal) {
    // A native client uses this challenge to rotate an expired access token
    // before revoking the stable device session. No-header sign-out above stays
    // idempotent for a client that has already discarded its credentials.
    return apiUnauthorized();
  }

  await revokeNativeAppSession(principal);
  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
