"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

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
  if (!email || !password) return { error: "Enter your email and password." };

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return { error: "" };
  } catch (err) {
    // signIn throws a redirect on success — let it propagate.
    if (err instanceof AuthError)
      return { error: "Invalid email or password." };
    throw err;
  }
}
