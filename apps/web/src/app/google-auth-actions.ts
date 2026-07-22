"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimits,
  requestNetworkRateLimitKey,
} from "@/lib/auth-rate-limit";
import { getCurrentUser } from "@/lib/current-user";
import {
  clearGoogleOauthIntentCookie,
  createGoogleOauthIntent,
  setGoogleOauthIntentCookie,
} from "@/lib/google-auth";
import { isGoogleAuthEnabled } from "@/lib/google-auth-config";
import { safeReturnTo } from "@/lib/safe-return-to";

async function requireGoogle(destination: "/login" | "/signup") {
  if (!isGoogleAuthEnabled()) redirect(`${destination}?google=unavailable`);
}

export async function beginGoogleSignInAction(
  formData: FormData,
): Promise<void> {
  await requireGoogle("/login");
  // A stale signup/link handoff must never change the intent of an explicit
  // sign-in click.
  await clearGoogleOauthIntentCookie();
  await signIn("google", {
    redirectTo: safeReturnTo(formData.get("returnTo")),
  });
}

export async function beginGoogleSignupAction(
  formData: FormData,
): Promise<void> {
  await requireGoogle("/signup");

  const networkKey = await requestNetworkRateLimitKey();
  if (networkKey) {
    const limit = await consumeAuthRateLimits([
      { policy: AUTH_RATE_LIMITS.signUpNetwork, key: networkKey },
    ]);
    if (limit.limited) redirect("/signup?google=rate-limited");
  }

  const secret = await createGoogleOauthIntent({
    kind: "signup",
    inviteToken: String(formData.get("invite") ?? ""),
  });
  await setGoogleOauthIntentCookie(secret);
  await signIn("google", { redirectTo: "/" });
}

export async function beginGoogleLinkAction(): Promise<void> {
  await requireGoogle("/login");
  const user = await getCurrentUser();
  const secret = await createGoogleOauthIntent({
    kind: "link",
    userId: user.id,
    sessionVersion: user.sessionVersion,
  });
  await setGoogleOauthIntentCookie(secret);
  await signIn("google", { redirectTo: "/settings?section=account" });
}
