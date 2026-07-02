"use server";

import { count } from "drizzle-orm";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

export interface AuthActionState {
  error: string;
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

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "Enter an email and password." };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // Single-user app: registration is only open until the first account exists.
  const [{ value: existing }] = await db.select({ value: count() }).from(users);
  if (existing > 0) {
    return { error: "An account already exists. Please sign in." };
  }

  await db
    .insert(users)
    .values({ email, passwordHash: hashPassword(password) });

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return { error: "" };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Account created — please sign in." };
    }
    throw err;
  }
}

/** Whether any account exists yet — decides register vs. login on first run. */
export async function hasAnyUser(): Promise<boolean> {
  const [{ value }] = await db.select({ value: count() }).from(users);
  return value > 0;
}
