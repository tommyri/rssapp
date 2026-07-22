import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  sendEmailVerification,
  verifyEmailToken,
} from "@/lib/account-lifecycle";
import { AccountTokenCooldownError } from "@/lib/account-tokens";
import { apiError, apiJson } from "@/lib/api-v1-response";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimits,
  emailRateLimitKey,
  networkRateLimitKeyFromHeaders,
} from "@/lib/auth-rate-limit";
import { EmailDeliveryError } from "@/lib/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resendSchema = z
  .object({ email: z.string().trim().toLowerCase().email() })
  .strict();
const verifySchema = z.object({ token: z.string().min(1) }).strict();
const genericMessage =
  "If that email still needs verification, a new link is on its way.";

/** Resend without revealing whether an account exists or is already verified. */
export async function POST(request: Request) {
  const parsed = resendSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return apiError("invalid_request", "Enter a valid email address.", 400);
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
  if (limit.limited) return apiJson({ data: { message: genericMessage } });

  try {
    const user = await db.query.users.findFirst({
      columns: { id: true },
      where: eq(users.email, parsed.data.email),
    });
    if (user) await sendEmailVerification(user.id);
  } catch (error) {
    if (error instanceof AccountTokenCooldownError) {
      return apiJson({ data: { message: genericMessage } });
    }
    if (error instanceof EmailDeliveryError) {
      console.error("[native-auth] verification resend unavailable:", error);
      return apiError(
        "email_unavailable",
        "We could not send a verification email right now. Try again shortly.",
        503,
      );
    }
    console.error("[native-auth] verification resend failed:", error);
    return apiError(
      "verification_failed",
      "We could not send a verification email. Try again.",
      500,
    );
  }
  return apiJson({ data: { message: genericMessage } });
}

/** Consume a universal-link token inside the native application. */
export async function PATCH(request: Request) {
  const parsed = verifySchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return apiError(
      "invalid_verification_token",
      "This verification link is invalid or has expired.",
      400,
    );
  }

  const result = await verifyEmailToken(parsed.data.token);
  if (result === "invalid") {
    return apiError(
      "invalid_verification_token",
      "This verification link is invalid or has expired.",
      400,
    );
  }
  return apiJson({
    data: {
      status: result,
      message:
        result === "changed"
          ? "Email address confirmed."
          : "Email address verified. You can now sign in.",
    },
  });
}
