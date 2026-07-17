"use server";

import { z } from "zod";
import type { AuthActionState } from "@/app/login/actions";
import { startRegistration } from "@/lib/account-lifecycle";
import { hashPassword } from "@/lib/password";
import { EmailDeliveryError } from "@/lib/transactional-email";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return {
      error: "Enter a valid email and a password of at least 8 characters.",
    };
  }

  try {
    const result = await startRegistration({
      rawEmail: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
    });
    if (result === "already_verified") {
      return {
        error: "An account with this email already exists. Please sign in.",
      };
    }
    return {
      error: "",
      message:
        "Check your email for a verification link. Once verified, you can sign in.",
    };
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      console.error("[account] signup verification email unavailable:", error);
      return {
        error:
          "We could not send a verification email right now. Please try again shortly.",
      };
    }
    console.error("[account] signup failed:", error);
    return { error: "We could not create your account. Please try again." };
  }
}
