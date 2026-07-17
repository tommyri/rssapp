"use server";

import { z } from "zod";
import { requestPasswordReset } from "@/lib/account-lifecycle";
import { AccountTokenCooldownError } from "@/lib/account-tokens";
import { EmailDeliveryError } from "@/lib/transactional-email";

export interface RecoveryActionState {
  ok: boolean;
  message: string;
}

export async function requestPasswordResetAction(
  _prev: RecoveryActionState,
  formData: FormData,
): Promise<RecoveryActionState> {
  const email = z
    .string()
    .email()
    .safeParse(
      String(formData.get("email") ?? "")
        .toLowerCase()
        .trim(),
    );
  if (!email.success) return { ok: false, message: "Enter a valid email." };

  try {
    await requestPasswordReset(email.data);
  } catch (error) {
    if (error instanceof AccountTokenCooldownError) {
      // Keep this response identical to a successful unknown-address request.
      // Password-reset throttling must not become an account-enumeration signal.
      return {
        ok: true,
        message:
          "If that email belongs to an active account, a reset link is on its way.",
      };
    }
    if (error instanceof EmailDeliveryError) {
      console.error("[account] password reset email unavailable:", error);
      return {
        ok: false,
        message:
          "We could not send a reset email right now. Try again shortly.",
      };
    }
    console.error("[account] password reset request failed:", error);
    return {
      ok: false,
      message: "We could not send a reset email. Try again.",
    };
  }

  // Do not reveal whether a particular address has an account.
  return {
    ok: true,
    message:
      "If that email belongs to an active account, a reset link is on its way.",
  };
}
