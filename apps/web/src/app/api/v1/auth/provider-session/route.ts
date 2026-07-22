import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { apiError, apiJson } from "@/lib/api-v1-response";
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  consumeAuthRateLimit,
  networkRateLimitKeyFromHeaders,
} from "@/lib/auth-rate-limit";
import { createNativeAppSession } from "@/lib/native-app-sessions";
import { nativeSessionResponse } from "@/lib/native-auth-response";
import { resolveNativeProviderAccount } from "@/lib/native-provider-accounts";
import {
  verifyNativeAppleProof,
  verifyNativeGoogleProof,
} from "@/lib/native-provider-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseFields = {
  identityToken: z.string().min(1).max(16_384),
  deviceName: z.string().trim().max(100).optional().default(""),
  inviteToken: z.string().max(256).optional(),
};
const requestSchema = z.discriminatedUnion("provider", [
  z
    .object({
      provider: z.literal("apple"),
      ...baseFields,
      challenge: z.string().min(1).max(128),
      displayName: z.string().trim().max(100).optional(),
    })
    .strict(),
  z
    .object({
      provider: z.literal("google"),
      ...baseFields,
    })
    .strict(),
]);

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return apiError(
      "invalid_request",
      "The provider sign-in proof is invalid.",
      400,
    );
  }

  const networkKey = networkRateLimitKeyFromHeaders(request.headers);
  if (networkKey) {
    const limit = await checkAuthRateLimit(
      AUTH_RATE_LIMITS.signInNetwork,
      networkKey,
    );
    if (limit.limited) {
      return apiError(
        "rate_limited",
        `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
        429,
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }
  }

  const identity =
    parsed.data.provider === "apple"
      ? await verifyNativeAppleProof({
          identityToken: parsed.data.identityToken,
          challenge: parsed.data.challenge,
          displayName: parsed.data.displayName,
        })
      : await verifyNativeGoogleProof(parsed.data.identityToken);
  if (!identity) {
    if (networkKey) {
      await consumeAuthRateLimit(AUTH_RATE_LIMITS.signInNetwork, networkKey);
    }
    return apiError(
      "invalid_provider_proof",
      `Sign in with ${parsed.data.provider === "apple" ? "Apple" : "Google"} could not be verified.`,
      401,
    );
  }

  const result = await resolveNativeProviderAccount({
    identity,
    inviteToken: parsed.data.inviteToken,
  });
  if (result.kind !== "account") {
    const errors = {
      account_unavailable: [
        "account_unavailable",
        "This Currentfold account is not available.",
        403,
      ],
      email_required: [
        "provider_email_required",
        "The provider did not return a verified email address.",
        403,
      ],
      link_required: [
        "provider_link_required",
        "An account with this email already exists. Sign in with your password and connect this provider from account settings.",
        409,
      ],
      registration_closed: [
        "registration_closed",
        "This Currentfold server is not accepting new accounts right now.",
        403,
      ],
      invite_required: [
        "invite_required",
        "An active invitation for this email address is required.",
        403,
      ],
    } as const;
    const [code, message, status] = errors[result.kind];
    return apiError(code, message, status);
  }

  await db
    .update(users)
    .set({ lastSignedInAt: new Date() })
    .where(eq(users.id, result.account.id));
  const grant = await createNativeAppSession({
    user: result.account,
    deviceName: parsed.data.deviceName,
  });
  return apiJson(nativeSessionResponse(grant));
}
