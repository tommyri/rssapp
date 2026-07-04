"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { hashPassword, verifyPassword } from "@/lib/password";

export interface AccountActionState {
  ok: boolean;
  message: string;
}

/** Load the user and check their current password — required for any credential change. */
async function verifyCurrentPassword(
  userId: number,
  currentPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { ok: false, message: "Account not found." };
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return { ok: false, message: "Current password is incorrect." };
  }
  return { ok: true };
}

export async function changeEmailAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const email = z
    .string()
    .email()
    .safeParse(
      String(formData.get("email") ?? "")
        .toLowerCase()
        .trim(),
    );
  if (!email.success) return { ok: false, message: "Enter a valid email." };
  const currentPassword = String(formData.get("currentPassword") ?? "");

  const userId = await getCurrentUserId();
  const check = await verifyCurrentPassword(userId, currentPassword);
  if (!check.ok) return { ok: false, message: check.message };

  await db.update(users).set({ email: email.data }).where(eq(users.id, userId));
  return { ok: true, message: `Email changed to ${email.data}.` };
}

export async function changePasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (newPassword.length < 8) {
    return {
      ok: false,
      message: "New password must be at least 8 characters.",
    };
  }
  if (newPassword !== confirm) {
    return { ok: false, message: "New passwords don't match." };
  }

  const userId = await getCurrentUserId();
  const check = await verifyCurrentPassword(userId, currentPassword);
  if (!check.ok) return { ok: false, message: check.message };

  await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(users.id, userId));
  return { ok: true, message: "Password changed." };
}
