import { z } from "zod";
import {
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/lib/account-lifecycle";
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

const requestSchema = z
  .object({ email: z.string().trim().toLowerCase().email() })
  .strict();
const resetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8).max(1024),
  })
  .strict();
const recoveryMessage =
  "If that email belongs to an active account, a reset link is on its way.";

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return apiError("invalid_request", "Enter a valid email address.", 400);
  }

  const networkKey = networkRateLimitKeyFromHeaders(request.headers);
  const limit = await consumeAuthRateLimits([
    {
      policy: AUTH_RATE_LIMITS.recoveryEmail,
      key: emailRateLimitKey(parsed.data.email),
    },
    ...(networkKey
      ? [{ policy: AUTH_RATE_LIMITS.recoveryNetwork, key: networkKey }]
      : []),
  ]);
  if (limit.limited) return apiJson({ data: { message: recoveryMessage } });

  try {
    await requestPasswordReset(parsed.data.email);
  } catch (error) {
    if (error instanceof AccountTokenCooldownError) {
      return apiJson({ data: { message: recoveryMessage } });
    }
    if (error instanceof EmailDeliveryError) {
      console.error("[native-auth] recovery email unavailable:", error);
      return apiError(
        "email_unavailable",
        "We could not send a reset email right now. Try again shortly.",
        503,
      );
    }
    console.error("[native-auth] recovery request failed:", error);
    return apiError(
      "recovery_failed",
      "We could not send a reset email. Try again.",
      500,
    );
  }
  return apiJson({ data: { message: recoveryMessage } });
}

export async function PATCH(request: Request) {
  const parsed = resetSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return apiError(
      "invalid_request",
      "Use a valid reset link and a password of at least 8 characters.",
      400,
    );
  }

  const reset = await resetPasswordWithToken(
    parsed.data.token,
    hashPassword(parsed.data.password),
  );
  if (!reset) {
    return apiError(
      "invalid_reset_token",
      "This reset link is invalid or has expired.",
      400,
    );
  }
  return apiJson({
    data: { message: "Password reset. You can now sign in." },
  });
}
