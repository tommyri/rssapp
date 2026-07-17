import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { GoogleProfile } from "next-auth/providers/google";
import { db } from "@/db";
import {
  accountInvites,
  instanceSettings,
  oauthIdentities,
  oauthIntents,
  users,
} from "@/db/schema";
import { registrationAdmission } from "@/lib/account-invitations";
import { registrationRole } from "@/lib/account-lifecycle";
import {
  createAccountTokenSecret,
  hashAccountToken,
  isAccountTokenSecret,
  normalizeAccountEmail,
} from "@/lib/account-tokens";
import { isGoogleAuthEnabled } from "@/lib/google-auth-config";

const GOOGLE_OAUTH_INTENT_COOKIE = "rssapp-google-oauth-intent";
export const GOOGLE_OAUTH_INTENT_TTL_MS = 10 * 60 * 1000;

type GoogleIntentKind = "signup" | "link";

interface ActiveAccount {
  id: number;
  email: string;
  sessionVersion: number;
}

interface GoogleIntent {
  kind: GoogleIntentKind;
  userId: number | null;
  sessionVersion: number | null;
  invitationTokenHash: string | null;
}

type GoogleAuthentication =
  | { kind: "account"; account: ActiveAccount }
  | { kind: "redirect"; url: string };

function loginNotice(notice: string): GoogleAuthentication {
  return { kind: "redirect", url: `/login?google=${notice}` };
}

function signupNotice(notice: string): GoogleAuthentication {
  return { kind: "redirect", url: `/signup?google=${notice}` };
}

function settingsNotice(notice: string): GoogleAuthentication {
  return {
    kind: "redirect",
    url: `/settings?section=account&google=${notice}`,
  };
}

async function activeAccount(userId: number): Promise<ActiveAccount | null> {
  const user = await db.query.users.findFirst({
    columns: {
      id: true,
      email: true,
      sessionVersion: true,
    },
    where: and(eq(users.id, userId), eq(users.status, "active")),
  });
  return user ?? null;
}

function googleEmail(profile: GoogleProfile | undefined): string | null {
  if (!profile?.email_verified || typeof profile.email !== "string")
    return null;
  const email = normalizeAccountEmail(profile.email);
  return email || null;
}

/** Start a short-lived, one-time OAuth handoff from a trusted server action. */
export async function createGoogleOauthIntent({
  kind,
  userId,
  sessionVersion,
  inviteToken,
}: {
  kind: GoogleIntentKind;
  userId?: number;
  sessionVersion?: number;
  inviteToken?: string;
}): Promise<string> {
  if (kind === "link" && (!userId || sessionVersion === undefined)) {
    throw new Error("A current account is required to link Google.");
  }

  const secret = createAccountTokenSecret();
  await db.insert(oauthIntents).values({
    provider: "google",
    kind,
    tokenHash: hashAccountToken(secret),
    userId: kind === "link" ? userId : null,
    sessionVersion: kind === "link" ? sessionVersion : null,
    invitationTokenHash:
      kind === "signup" && inviteToken && isAccountTokenSecret(inviteToken)
        ? hashAccountToken(inviteToken)
        : null,
    expiresAt: new Date(Date.now() + GOOGLE_OAUTH_INTENT_TTL_MS),
  });
  return secret;
}

export async function setGoogleOauthIntentCookie(
  secret: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_OAUTH_INTENT_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.ceil(GOOGLE_OAUTH_INTENT_TTL_MS / 1000),
  });
}

export async function clearGoogleOauthIntentCookie(): Promise<void> {
  (await cookies()).delete(GOOGLE_OAUTH_INTENT_COOKIE);
}

/**
 * A callback can consume an intent once. Keeping its secret in an HttpOnly
 * cookie means neither its target account nor an invitation is exposed to the
 * Google authorization URL.
 */
async function consumeGoogleOauthIntent(): Promise<GoogleIntent | null> {
  const secret = (await cookies()).get(GOOGLE_OAUTH_INTENT_COOKIE)?.value;
  if (!secret || !isAccountTokenSecret(secret)) return null;

  const [intent] = await db
    .update(oauthIntents)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(oauthIntents.provider, "google"),
        eq(oauthIntents.tokenHash, hashAccountToken(secret)),
        isNull(oauthIntents.usedAt),
        gt(oauthIntents.expiresAt, new Date()),
      ),
    )
    .returning({
      kind: oauthIntents.kind,
      userId: oauthIntents.userId,
      sessionVersion: oauthIntents.sessionVersion,
      invitationTokenHash: oauthIntents.invitationTokenHash,
    });
  return intent ?? null;
}

async function existingGoogleIdentity(subject: string): Promise<{
  userId: number;
  account: ActiveAccount | null;
} | null> {
  const identity = await db.query.oauthIdentities.findFirst({
    columns: { userId: true },
    where: and(
      eq(oauthIdentities.provider, "google"),
      eq(oauthIdentities.providerAccountId, subject),
    ),
  });
  if (!identity) return null;
  return {
    userId: identity.userId,
    account: await activeAccount(identity.userId),
  };
}

type GoogleAccountCreation =
  | { kind: "account"; account: ActiveAccount }
  | { kind: "linked_to_other_account" }
  | { kind: "link_required" }
  | { kind: "registration_closed" }
  | { kind: "invite_required" };

async function createGoogleAccount({
  email,
  subject,
  invitationTokenHash,
}: {
  email: string;
  subject: string;
  invitationTokenHash: string | null;
}): Promise<GoogleAccountCreation> {
  const now = new Date();
  return db.transaction(async (tx) => {
    // Serialize both the provider subject and email address. The latter shares
    // the same lock as password signup, avoiding accidental email-based merges.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`google:${subject}`}))`,
    );
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

    const [knownIdentity] = await tx
      .select({ userId: oauthIdentities.userId })
      .from(oauthIdentities)
      .where(
        and(
          eq(oauthIdentities.provider, "google"),
          eq(oauthIdentities.providerAccountId, subject),
        ),
      )
      .for("update");
    if (knownIdentity) return { kind: "linked_to_other_account" as const };

    const [existingByEmail] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .for("update");
    if (existingByEmail) return { kind: "link_required" as const };

    const [settings] = await tx
      .select({ registrationMode: instanceSettings.registrationMode })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, 1))
      .for("update");
    const registrationMode = settings?.registrationMode ?? "open";

    let invitation: { id: number } | undefined;
    if (invitationTokenHash) {
      [invitation] = await tx
        .select({ id: accountInvites.id })
        .from(accountInvites)
        .where(
          and(
            eq(accountInvites.tokenHash, invitationTokenHash),
            eq(accountInvites.email, email),
            isNull(accountInvites.acceptedAt),
            isNull(accountInvites.revokedAt),
            gt(accountInvites.expiresAt, now),
          ),
        )
        .for("update");
    }
    const admission = registrationAdmission(
      registrationMode,
      Boolean(invitation),
    );
    if (admission === "closed") {
      return { kind: "registration_closed" as const };
    }
    if (admission === "invite_required") {
      return { kind: "invite_required" as const };
    }

    const [{ value: accountCount }] = await tx
      .select({ value: count() })
      .from(users);
    const role = registrationRole(accountCount);
    let user: ActiveAccount | undefined;
    if (role === "owner") {
      [user] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: null,
          emailVerifiedAt: now,
          role,
        })
        .onConflictDoNothing()
        .returning({
          id: users.id,
          email: users.email,
          sessionVersion: users.sessionVersion,
        });
    }
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: null,
          emailVerifiedAt: now,
          role: "member",
        })
        .onConflictDoNothing()
        .returning({
          id: users.id,
          email: users.email,
          sessionVersion: users.sessionVersion,
        });
    }
    if (!user) return { kind: "link_required" as const };

    const [identity] = await tx
      .insert(oauthIdentities)
      .values({
        userId: user.id,
        provider: "google",
        providerAccountId: subject,
      })
      .onConflictDoNothing()
      .returning({ id: oauthIdentities.id });
    if (!identity) return { kind: "linked_to_other_account" as const };

    if (invitation) {
      await tx
        .update(accountInvites)
        .set({ acceptedAt: now })
        .where(eq(accountInvites.id, invitation.id));
    }
    return { kind: "account" as const, account: user };
  });
}

async function touchLastSignedIn(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ lastSignedInAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Resolves Google’s verified provider subject into one local account. Calls
 * from auth.ts assign the returned id to Auth.js' JWT user, so the normal
 * current-user check remains the final authority for every later request.
 */
export async function completeGoogleAuthentication(
  profile: GoogleProfile | undefined,
): Promise<GoogleAuthentication> {
  if (!isGoogleAuthEnabled()) return loginNotice("unavailable");
  const email = googleEmail(profile);
  if (!email || !profile?.sub) return loginNotice("email-unverified");

  const intent = await consumeGoogleOauthIntent();
  const linkedIdentity = await existingGoogleIdentity(profile.sub);
  if (linkedIdentity) {
    if (intent?.kind === "link") {
      if (intent.userId !== linkedIdentity.userId) {
        return settingsNotice("already-connected");
      }
      if (
        !linkedIdentity.account ||
        intent.sessionVersion !== linkedIdentity.account.sessionVersion
      ) {
        return settingsNotice("link-expired");
      }
      return settingsNotice("connected");
    }
    if (!linkedIdentity.account) return loginNotice("account-unavailable");
    await touchLastSignedIn(linkedIdentity.account.id);
    return { kind: "account", account: linkedIdentity.account };
  }

  if (intent?.kind === "link") {
    if (!intent.userId || intent.sessionVersion === null) {
      return settingsNotice("link-expired");
    }
    const account = await activeAccount(intent.userId);
    if (!account || account.sessionVersion !== intent.sessionVersion) {
      return settingsNotice("link-expired");
    }
    const [identity] = await db
      .insert(oauthIdentities)
      .values({
        userId: account.id,
        provider: "google",
        providerAccountId: profile.sub,
      })
      .onConflictDoNothing()
      .returning({ id: oauthIdentities.id });
    if (!identity) return settingsNotice("already-connected");
    return settingsNotice("connected");
  }

  if (intent?.kind !== "signup") return signupNotice("account-not-found");

  const created = await createGoogleAccount({
    email,
    subject: profile.sub,
    invitationTokenHash: intent.invitationTokenHash,
  });
  if (created.kind === "registration_closed") {
    return signupNotice("registration-closed");
  }
  if (created.kind === "invite_required")
    return signupNotice("invite-required");
  if (created.kind === "link_required") return loginNotice("link-required");
  if (created.kind === "linked_to_other_account") {
    return loginNotice("account-unavailable");
  }
  await touchLastSignedIn(created.account.id);
  return { kind: "account", account: created.account };
}

export async function hasGoogleIdentity(userId: number): Promise<boolean> {
  const identity = await db.query.oauthIdentities.findFirst({
    columns: { id: true },
    where: and(
      eq(oauthIdentities.userId, userId),
      eq(oauthIdentities.provider, "google"),
    ),
  });
  return Boolean(identity);
}
