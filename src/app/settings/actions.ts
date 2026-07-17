"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  requestEmailChange,
  sendEmailVerification,
} from "@/lib/account-lifecycle";
import { AccountTokenCooldownError } from "@/lib/account-tokens";
import { isArticleListDensity } from "@/lib/article-list-density";
import { getCurrentUserId } from "@/lib/current-user";
import {
  EMBED_PROVIDERS,
  type EmbedLoadingPreferences,
  isEmbedLoadMode,
} from "@/lib/embed-loading";
import { hashPassword, verifyPassword } from "@/lib/password";
import { EmailDeliveryError } from "@/lib/transactional-email";

export interface AccountActionState {
  ok: boolean;
  message: string;
}

const displayNameSchema = z.string().trim().max(80);

export async function updateProfileAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const displayName = displayNameSchema.safeParse(
    String(formData.get("displayName") ?? ""),
  );
  if (!displayName.success) {
    return { ok: false, message: "Your name can be at most 80 characters." };
  }

  const userId = await getCurrentUserId();
  await db
    .update(users)
    .set({ displayName: displayName.data || null })
    .where(eq(users.id, userId));
  return { ok: true, message: "Saved." };
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

  let result: Awaited<ReturnType<typeof requestEmailChange>>;
  try {
    result = await requestEmailChange(userId, email.data);
  } catch (error) {
    if (error instanceof AccountTokenCooldownError) {
      return {
        ok: true,
        message: `A confirmation email was sent recently. Check ${email.data} or try again in ${error.retryAfterSeconds} seconds.`,
      };
    }
    if (error instanceof EmailDeliveryError) {
      console.error("[account] email change email unavailable:", error);
      return {
        ok: false,
        message:
          "We could not send a confirmation email right now. Try again shortly.",
      };
    }
    console.error("[account] email change request failed:", error);
    return { ok: false, message: "We could not send a confirmation email." };
  }
  if (result === "same") {
    return { ok: false, message: "That is already your current email." };
  }
  if (result === "taken") {
    return { ok: false, message: "That email is already in use." };
  }
  if (result === "missing") {
    return { ok: false, message: "Account not found." };
  }
  return {
    ok: true,
    message: `Check ${email.data} to confirm the change. Your current email stays active until then.`,
  };
}

export async function resendVerificationAction(
  _prev: AccountActionState,
  _formData: FormData,
): Promise<AccountActionState> {
  const userId = await getCurrentUserId();
  let sent: boolean;
  try {
    sent = await sendEmailVerification(userId);
  } catch (error) {
    if (error instanceof AccountTokenCooldownError) {
      return {
        ok: true,
        message: `A verification email was sent recently. Check your inbox or try again in ${error.retryAfterSeconds} seconds.`,
      };
    }
    if (error instanceof EmailDeliveryError) {
      console.error("[account] verification email unavailable:", error);
      return {
        ok: false,
        message:
          "We could not send a verification email right now. Try again shortly.",
      };
    }
    console.error("[account] verification resend failed:", error);
    return { ok: false, message: "We could not send a verification email." };
  }
  if (!sent) {
    return { ok: false, message: "This email is already verified." };
  }
  return { ok: true, message: "Verification email sent." };
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
  const articleListDensity = String(formData.get("articleListDensity") ?? "");
  if (!isArticleListDensity(articleListDensity)) {
    return { ok: false, message: "Choose an article list density." };
  }
  const embedDefault = String(formData.get("embedDefault") ?? "");
  if (!isEmbedLoadMode(embedDefault)) {
    return { ok: false, message: "Choose how embeds should load." };
  }
  const embedProviders: EmbedLoadingPreferences["providers"] = {};
  for (const provider of EMBED_PROVIDERS) {
    const value = String(formData.get(`embedProvider-${provider}`) ?? "");
    if (value === "inherit") continue;
    if (!isEmbedLoadMode(value)) {
      return { ok: false, message: "Choose a valid platform override." };
    }
    embedProviders[provider] = value;
  }

  const userId = await getCurrentUserId();
  // Merge onto the existing settings so we never clobber another preference.
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const settings = {
    ...(user?.settings ?? {}),
    collapseDuplicates,
    articleListDensity,
    embedLoading: { default: embedDefault, providers: embedProviders },
  };
  if (days) settings.autoReadDays = days;
  else delete settings.autoReadDays;
  await db.update(users).set({ settings }).where(eq(users.id, userId));

  return { ok: true, message: "Saved." };
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
