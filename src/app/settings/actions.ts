"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";
import { hashPassword, verifyPassword } from "@/lib/password";
import { DEFAULT_AUTO_READ_DAYS } from "@/lib/reading-prefs";

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

export async function updateReadingPrefsAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const raw = String(formData.get("autoReadDays") ?? "").trim();
  const days = raw === "" ? null : Number(raw);
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 365)) {
    return { ok: false, message: "Days must be a whole number from 1 to 365." };
  }
  // Unchecked checkboxes are omitted from FormData entirely.
  const collapseDuplicates = formData.get("collapseDuplicates") === "on";

  const userId = await getCurrentUserId();
  // Merge onto the existing settings so we never clobber another preference.
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const settings = { ...(user?.settings ?? {}), collapseDuplicates };
  if (days) settings.autoReadDays = days;
  else delete settings.autoReadDays;
  await db.update(users).set({ settings }).where(eq(users.id, userId));

  const daysMsg = days
    ? `Auto-mark read after ${days} day${days === 1 ? "" : "s"}.`
    : `Auto-mark read after the ${DEFAULT_AUTO_READ_DAYS}-day default.`;
  const dupMsg = collapseDuplicates
    ? "Duplicate stories collapse into one."
    : "Duplicate stories show separately.";
  return { ok: true, message: `Saved. ${daysMsg} ${dupMsg}` };
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
