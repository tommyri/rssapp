"use server";

import { z } from "zod";
import { resetPasswordWithToken } from "@/lib/account-lifecycle";
import { isAccountTokenSecret } from "@/lib/account-tokens";
import { hashPassword } from "@/lib/password";

export interface ResetPasswordActionState {
  ok: boolean;
  message: string;
}

export async function resetPasswordAction(
  _prev: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!isAccountTokenSecret(token)) {
    return { ok: false, message: "This reset link is invalid or has expired." };
  }
  const parsedPassword = z.string().min(8).safeParse(password);
  if (!parsedPassword.success) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { ok: false, message: "Passwords do not match." };
  }

  const reset = await resetPasswordWithToken(token, hashPassword(password));
  if (!reset) {
    return { ok: false, message: "This reset link is invalid or has expired." };
  }
  return {
    ok: true,
    message: "Password reset. You can now sign in with your new password.",
  };
}
