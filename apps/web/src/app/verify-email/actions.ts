"use server";

import { verifyEmailToken } from "@/lib/account-lifecycle";
import { isAccountTokenSecret } from "@/lib/account-tokens";

export interface VerifyEmailActionState {
  ok: boolean;
  message: string;
}

export async function verifyEmailAction(
  _prev: VerifyEmailActionState,
  formData: FormData,
): Promise<VerifyEmailActionState> {
  const token = String(formData.get("token") ?? "");
  if (!isAccountTokenSecret(token)) {
    return {
      ok: false,
      message: "This verification link is invalid or has expired.",
    };
  }

  const result = await verifyEmailToken(token);
  if (result === "invalid") {
    return {
      ok: false,
      message: "This verification link is invalid or has expired.",
    };
  }
  return {
    ok: true,
    message:
      result === "changed"
        ? "Email address confirmed. You can keep using rssapp."
        : "Email address verified. You can sign in.",
  };
}
