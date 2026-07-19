"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimits,
  consumeAuthRateLimits,
  emailRateLimitKey,
  requestNetworkRateLimitKey,
} from "@/lib/auth-rate-limit";
import { safeReturnTo } from "@/lib/safe-return-to";

export interface AuthActionState {
  error: string;
  message?: string;
}

function readCredentials(formData: FormData): {
  email: string;
  password: string;
} {
  return {
    email: String(formData.get("email") ?? "")
      .toLowerCase()
      .trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, password } = readCredentials(formData);
  const returnTo = safeReturnTo(formData.get("returnTo"));
  if (!email || !password) return { error: "Enter your email and password." };

  const networkKey = await requestNetworkRateLimitKey();
  const targets = [
    { policy: AUTH_RATE_LIMITS.signInEmail, key: emailRateLimitKey(email) },
    ...(networkKey
      ? [{ policy: AUTH_RATE_LIMITS.signInNetwork, key: networkKey }]
      : []),
  ];
  const currentLimit = await checkAuthRateLimits(targets);
  if (currentLimit.limited) {
    return {
      error: `Too many sign-in attempts. Try again in ${currentLimit.retryAfterSeconds} seconds.`,
    };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: returnTo });
    return { error: "" };
  } catch (err) {
    // signIn throws a redirect on success — let it propagate.
    if (err instanceof AuthError) {
      const nextLimit = await consumeAuthRateLimits(targets);
      if (nextLimit.limited) {
        return {
          error: `Too many sign-in attempts. Try again in ${nextLimit.retryAfterSeconds} seconds.`,
        };
      }
      return { error: "Invalid email or password." };
    }
    throw err;
  }
}
