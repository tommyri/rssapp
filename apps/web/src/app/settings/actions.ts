"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { accountAuditEvents, users } from "@/db/schema";
import { accountAuditEventValues } from "@/lib/account-audit";
import { accountDeletionConfirmationError } from "@/lib/account-deletion";
import {
  requestEmailChange,
  sendEmailVerification,
} from "@/lib/account-lifecycle";
import { AccountTokenCooldownError } from "@/lib/account-tokens";
import {
  createApiAccessToken,
  normalizeApiAccessTokenName,
  revokeApiAccessToken,
} from "@/lib/api-access-tokens";
import { isArticleListDensity } from "@/lib/article-list-density";
import {
  revokeAuthSession,
  revokeOtherAuthSessions,
} from "@/lib/auth-sessions";
import {
  getCurrentSessionId,
  getCurrentUser,
  getCurrentUserId,
} from "@/lib/current-user";
import {
  EMBED_PROVIDERS,
  type EmbedLoadingPreferences,
  isEmbedLoadMode,
} from "@/lib/embed-loading";
import { isValidDigestTimezone } from "@/lib/notification-digest-schedule";
import {
  disableNotificationDigests,
  NotificationDigestPreferenceError,
  saveNotificationDigestPreferences,
  sendTestNotificationDigest,
} from "@/lib/notification-digests";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  parsePushSubscription,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push-notifications";
import {
  EmailDeliveryError,
  isEmailDeliveryConfigured,
} from "@/lib/transactional-email";

export interface AccountActionState {
  ok: boolean;
  message: string;
}

export interface ApiAccessTokenActionState extends AccountActionState {
  /** Set only after creation; raw credentials are never stored server-side. */
  secret?: string;
}

export interface NotificationDigestActionState extends AccountActionState {
  nextRunAt?: string | null;
}

const displayNameSchema = z.string().trim().max(80);

export async function createApiAccessTokenAction(
  _prev: ApiAccessTokenActionState,
  formData: FormData,
): Promise<ApiAccessTokenActionState> {
  const name = normalizeApiAccessTokenName(String(formData.get("name") ?? ""));
  if (!name) {
    return {
      ok: false,
      message: "Name this connection with 1 to 80 characters.",
    };
  }

  const userId = await getCurrentUserId();
  try {
    const { secret } = await createApiAccessToken({ userId, name });
    revalidatePath("/settings");
    return {
      ok: true,
      message:
        "App password created. Copy it now — it will not be shown again.",
      secret,
    };
  } catch (error) {
    console.error("[account] API access token creation failed:", error);
    return {
      ok: false,
      message: "We could not create that app password. Try again.",
    };
  }
}

export async function revokeApiAccessTokenAction(
  _prev: ApiAccessTokenActionState,
  formData: FormData,
): Promise<ApiAccessTokenActionState> {
  const tokenId = Number(formData.get("tokenId"));
  if (!Number.isSafeInteger(tokenId) || tokenId < 1) {
    return { ok: false, message: "That app password is invalid." };
  }

  const userId = await getCurrentUserId();
  const revoked = await revokeApiAccessToken({ userId, tokenId });
  if (!revoked) {
    return {
      ok: false,
      message: "That app password is no longer available.",
    };
  }
  revalidatePath("/settings");
  return { ok: true, message: "App password revoked." };
}

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

/** Check the current password when this account has one configured. */
async function verifyCurrentPassword(
  userId: number,
  currentPassword: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { ok: false, message: "Account not found." };
  if (!user.passwordHash) return { ok: true };
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

/** Toggle whether matching notify rules add alerts to this account's inbox. */
export async function updateNotificationPreferencesAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const inAppRuleAlerts = formData.get("ruleNotificationsEnabled") === "on";
  const userId = await getCurrentUserId();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user)
    return { ok: false, message: "Your account is no longer available." };

  await db
    .update(users)
    .set({ settings: { ...user.settings, inAppRuleAlerts } })
    .where(eq(users.id, userId));
  if (!inAppRuleAlerts) await disableNotificationDigests(userId);
  revalidatePath("/");
  revalidatePath("/settings");
  return {
    ok: true,
    message: inAppRuleAlerts
      ? "Rule notifications are on."
      : "Rule notifications and email digests are off.",
  };
}

const digestPreferenceSchema = z.object({
  mode: z.enum(["off", "daily", "weekly"]),
  timezone: z.string().trim().min(1).max(100),
  deliveryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.coerce.number().int().min(1).max(7),
});

export async function updateNotificationDigestAction(
  _prev: NotificationDigestActionState,
  formData: FormData,
): Promise<NotificationDigestActionState> {
  const parsed = digestPreferenceSchema.safeParse({
    mode: formData.get("mode"),
    timezone: formData.get("timezone"),
    deliveryTime: formData.get("deliveryTime"),
    weekday: formData.get("weekday") ?? "1",
  });
  if (!parsed.success || !isValidDigestTimezone(parsed.data.timezone)) {
    return { ok: false, message: "Choose a valid digest schedule." };
  }
  const userId = await getCurrentUserId();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    return { ok: false, message: "Your account is no longer available." };
  }
  const enabled = parsed.data.mode !== "off";
  if (enabled && user.settings.inAppRuleAlerts === false) {
    return {
      ok: false,
      message: "Turn on rule notifications before enabling an email digest.",
    };
  }
  const [deliveryHour, deliveryMinute] = parsed.data.deliveryTime
    .split(":")
    .map(Number) as [number, number];
  try {
    const nextRunAt = await saveNotificationDigestPreferences({
      userId,
      enabled,
      cadence: parsed.data.mode === "weekly" ? "weekly" : "daily",
      timezone: parsed.data.timezone,
      deliveryHour,
      deliveryMinute,
      weekday: parsed.data.weekday,
    });
    revalidatePath("/settings");
    return {
      ok: true,
      message: enabled ? "Email digest scheduled." : "Email digest is off.",
      nextRunAt: nextRunAt?.toISOString() ?? null,
    };
  } catch (error) {
    if (error instanceof NotificationDigestPreferenceError) {
      return { ok: false, message: error.message };
    }
    console.error("[digest] preference update failed:", error);
    return { ok: false, message: "We could not save that digest schedule." };
  }
}

export async function sendTestNotificationDigestAction(
  _prev: AccountActionState,
  _formData: FormData,
): Promise<AccountActionState> {
  const userId = await getCurrentUserId();
  try {
    await sendTestNotificationDigest(userId);
    return {
      ok: true,
      message: isEmailDeliveryConfigured()
        ? "Test digest sent. Check your inbox."
        : "Test digest written to the local server log.",
    };
  } catch (error) {
    if (
      error instanceof NotificationDigestPreferenceError ||
      error instanceof EmailDeliveryError
    ) {
      return { ok: false, message: error.message };
    }
    console.error("[digest] test delivery failed:", error);
    return { ok: false, message: "We could not send the test digest." };
  }
}

/** Save an explicit, browser-owned Web Push subscription for this device. */
export async function savePushSubscriptionAction(
  rawSubscription: unknown,
): Promise<AccountActionState> {
  const subscription = parsePushSubscription(rawSubscription);
  if (!subscription) {
    return {
      ok: false,
      message: "This browser sent an invalid push subscription.",
    };
  }
  const userId = await getCurrentUserId();
  try {
    await savePushSubscription(userId, subscription);
  } catch {
    return {
      ok: false,
      message: "We could not enable browser notifications. Try again.",
    };
  }
  revalidatePath("/settings");
  return { ok: true, message: "Browser notifications are on for this device." };
}

/** Remove only the current device's browser subscription. */
export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<AccountActionState> {
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    return {
      ok: false,
      message: "This browser sent an invalid push subscription.",
    };
  }
  if (parsedEndpoint.protocol !== "https:" || endpoint.length > 2_048) {
    return {
      ok: false,
      message: "This browser sent an invalid push subscription.",
    };
  }
  const userId = await getCurrentUserId();
  try {
    await removePushSubscription(userId, endpoint);
  } catch {
    return {
      ok: false,
      message: "We could not turn off browser notifications. Try again.",
    };
  }
  revalidatePath("/settings");
  return {
    ok: true,
    message: "Browser notifications are off for this device.",
  };
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
  return {
    ok: true,
    message:
      check.ok && !currentPassword ? "Password set." : "Password changed.",
  };
}

export async function deleteAccountAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const currentUser = await getCurrentUser();
  const typedEmail = String(formData.get("confirmationEmail") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const currentPassword = String(formData.get("currentPassword") ?? "");

  const earlyError = accountDeletionConfirmationError({
    role: currentUser.role,
    accountEmail: currentUser.email,
    typedEmail,
    confirmation,
  });
  if (earlyError) return { ok: false, message: earlyError };

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .for("update");
    if (!user) return { ok: false as const, message: "Account not found." };

    const confirmationError = accountDeletionConfirmationError({
      role: user.role,
      accountEmail: user.email,
      typedEmail,
      confirmation,
    });
    if (confirmationError)
      return { ok: false as const, message: confirmationError };
    if (
      user.passwordHash &&
      !verifyPassword(currentPassword, user.passwordHash)
    ) {
      return { ok: false as const, message: "Current password is incorrect." };
    }

    // The user row owns every reader-specific relation through cascading FKs.
    // Global feeds and articles remain because other accounts can still use them.
    await tx.insert(accountAuditEvents).values(
      accountAuditEventValues({
        actorUserId: user.id,
        targetUserId: user.id,
        eventType: "account_deleted",
      }),
    );
    await tx.delete(users).where(eq(users.id, user.id));
    return { ok: true as const, message: "Account deleted." };
  });
  return result;
}

export async function revokeSessionAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const currentUser = await getCurrentUser();
  const currentSessionId = await getCurrentSessionId();
  if (!currentSessionId) {
    return {
      ok: false,
      message: "Sign out and back in before managing your signed-in sessions.",
    };
  }

  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId === currentSessionId) {
    return {
      ok: false,
      message: "Use Sign out to end this session.",
    };
  }
  const revoked = await revokeAuthSession({
    id: sessionId,
    userId: currentUser.id,
    sessionVersion: currentUser.sessionVersion,
  });
  if (!revoked) {
    return {
      ok: false,
      message: "That signed-in session is no longer active.",
    };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Session signed out." };
}

export async function revokeOtherSessionsAction(
  _prev: AccountActionState,
): Promise<AccountActionState> {
  const currentUser = await getCurrentUser();
  const currentSessionId = await getCurrentSessionId();
  if (!currentSessionId) {
    return {
      ok: false,
      message: "Sign out and back in before managing your signed-in sessions.",
    };
  }

  const count = await revokeOtherAuthSessions({
    currentSessionId,
    userId: currentUser.id,
    sessionVersion: currentUser.sessionVersion,
  });
  revalidatePath("/settings");
  return {
    ok: true,
    message:
      count === 0
        ? "No other signed-in sessions found."
        : `Signed out of ${count} other session${count === 1 ? "" : "s"}.`,
  };
}
