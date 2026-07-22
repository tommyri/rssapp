import { z } from "zod";
import { startRegistration } from "@/lib/account-lifecycle";
import { AccountTokenCooldownError } from "@/lib/account-tokens";
import { apiError, apiJson } from "@/lib/api-v1-response";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimits,
  emailRateLimitKey,
  networkRateLimitKeyFromHeaders,
} from "@/lib/auth-rate-limit";
import { hashPassword } from "@/lib/password";
import { EmailDeliveryError } from "@/lib/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const registrationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(1024),
    inviteToken: z.string().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return apiError(
      "invalid_request",
      "Enter a valid email and a password of at least 8 characters.",
      400,
    );
  }

  const networkKey = networkRateLimitKeyFromHeaders(request.headers);
  const limit = await consumeAuthRateLimits([
    {
      policy: AUTH_RATE_LIMITS.signUpEmail,
      key: emailRateLimitKey(parsed.data.email),
    },
    ...(networkKey
      ? [{ policy: AUTH_RATE_LIMITS.signUpNetwork, key: networkKey }]
      : []),
  ]);
  if (limit.limited) {
    return apiError(
      "rate_limited",
      `Too many account requests. Try again in ${limit.retryAfterSeconds} seconds.`,
      429,
      { "retry-after": String(limit.retryAfterSeconds) },
    );
  }

  try {
    const result = await startRegistration({
      rawEmail: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      inviteToken: parsed.data.inviteToken,
    });
    if (result === "already_verified") {
      return apiError(
        "account_exists",
        "An account with this email already exists. Sign in instead.",
        409,
      );
    }
    if (result === "registration_closed") {
      return apiError(
        "registration_closed",
        "This Currentfold server is not accepting new accounts right now.",
        403,
      );
    }
    if (result === "invite_required") {
      return apiError(
        "invite_required",
        "An active invitation for this email address is required.",
        403,
      );
    }

    return apiJson(
      {
        data: {
          status: "verification_required",
          message:
            "Check your email for a verification link, then return to Currentfold to sign in.",
        },
      },
      { status: result === "created" ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof AccountTokenCooldownError) {
      return apiJson({
        data: {
          status: "verification_required",
          message:
            "A verification link was sent recently. Check your inbox before requesting another.",
        },
      });
    }
    if (error instanceof EmailDeliveryError) {
      console.error("[native-auth] verification email unavailable:", error);
      return apiError(
        "email_unavailable",
        "We could not send a verification email right now. Try again shortly.",
        503,
      );
    }
    console.error("[native-auth] registration failed:", error);
    return apiError(
      "registration_failed",
      "We could not create your account. Try again.",
      500,
    );
  }
}
