import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accountInvites, instanceSettings, users } from "@/db/schema";
import { registrationAdmission } from "@/lib/account-invitations";
import {
  activeUserForAccountToken,
  consumeAccountToken,
  hashAccountToken,
  isAccountTokenSecret,
  issueAccountToken,
  normalizeAccountEmail,
  revokeAccountToken,
} from "@/lib/account-tokens";
import {
  sendEmailChangeVerification,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/transactional-email";

export type StartRegistrationResult =
  | "created"
  | "verification_resent"
  | "already_verified"
  | "registration_closed"
  | "invite_required";

async function deliverAccountToken({
  userId,
  kind,
  email,
  deliver,
}: {
  userId: number;
  kind: "email_verification" | "password_reset" | "email_change";
  email: string;
  deliver: (token: string) => Promise<void>;
}): Promise<void> {
  const issued = await issueAccountToken({ userId, kind, email });
  try {
    await deliver(issued.secret);
  } catch (error) {
    try {
      await revokeAccountToken({ id: issued.id, userId, kind });
    } catch (revokeError) {
      console.error(
        "[account] could not revoke an undelivered token:",
        revokeError,
      );
    }
    throw error;
  }
}

/** Only an empty deployment may establish its owner through public signup. */
export function registrationRole(accountCount: number): "owner" | "member" {
  return accountCount === 0 ? "owner" : "member";
}

/**
 * Create a public account in its safely locked state, then deliver the proof
 * of address. Re-submitting an unverified address is intentional: it gives a
 * person a way to recover a lost or expired verification email without a
 * separate unauthenticated resend surface.
 */
export async function startRegistration({
  rawEmail,
  passwordHash,
  inviteToken,
}: {
  rawEmail: string;
  passwordHash: string;
  inviteToken?: string;
}): Promise<StartRegistrationResult> {
  const email = normalizeAccountEmail(rawEmail);
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    if (existing.emailVerifiedAt) return "already_verified";
    await sendEmailVerification(existing.id);
    return "verification_resent";
  }

  const registration = await db.transaction(async (tx) => {
    // Check again inside the transaction. Another request can create this
    // address after the initial lookup; it must not consume a second invite.
    const [racedUser] = await tx
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .for("update");
    if (racedUser) return { kind: "existing" as const, user: racedUser };

    const [settings] = await tx
      .select({ registrationMode: instanceSettings.registrationMode })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, 1))
      .for("update");
    const registrationMode = settings?.registrationMode ?? "open";

    let invitation: { id: number } | undefined;
    if (inviteToken && isAccountTokenSecret(inviteToken)) {
      [invitation] = await tx
        .select({ id: accountInvites.id })
        .from(accountInvites)
        .where(
          and(
            eq(accountInvites.tokenHash, hashAccountToken(inviteToken)),
            eq(accountInvites.email, email),
            isNull(accountInvites.acceptedAt),
            isNull(accountInvites.revokedAt),
            gt(accountInvites.expiresAt, new Date()),
          ),
        )
        .for("update");
    }
    const admission = registrationAdmission(
      registrationMode,
      Boolean(invitation),
    );
    if (admission === "closed") return { kind: "closed" as const };
    if (admission === "invite_required") {
      // Another tab can claim this invite while this request waits on its row.
      // In that case the account now exists and may safely request another
      // verification email instead of receiving a misleading invite error.
      const [claimedByAnotherRequest] = await tx
        .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(eq(users.email, email));
      if (claimedByAnotherRequest) {
        return { kind: "existing" as const, user: claimedByAnotherRequest };
      }
      return { kind: "invite_required" as const };
    }

    const [{ value: accountCount }] = await tx
      .select({ value: count() })
      .from(users);
    const role = registrationRole(accountCount);
    let user: { id: number } | undefined;

    // The very first account owns a fresh deployment. A partial unique index
    // keeps concurrent first signups safe; every registration into an existing
    // installation is a member, even if a legacy operator still needs setup.
    if (role === "owner") {
      [user] = await tx
        .insert(users)
        .values({ email, passwordHash, role })
        .onConflictDoNothing()
        .returning({ id: users.id });
    }
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({ email, passwordHash, role: "member" })
        .onConflictDoNothing()
        .returning({ id: users.id });
    }
    if (!user) return { kind: "race" as const };

    if (invitation) {
      await tx
        .update(accountInvites)
        .set({ acceptedAt: new Date() })
        .where(eq(accountInvites.id, invitation.id));
    }
    return { kind: "created" as const, user };
  });

  if (registration.kind === "closed") return "registration_closed";
  if (registration.kind === "invite_required") return "invite_required";
  if (registration.kind === "existing") {
    if (registration.user.emailVerifiedAt) return "already_verified";
    await sendEmailVerification(registration.user.id);
    return "verification_resent";
  }
  // A competing request can win the unique-email race between the lookup and
  // insert. It has either created this account or claimed its invite already.
  if (registration.kind === "race") {
    return startRegistration({ rawEmail: email, passwordHash });
  }

  await sendEmailVerification(registration.user.id);
  return "created";
}

export async function sendEmailVerification(userId: number): Promise<boolean> {
  const user = await activeUserForAccountToken(userId);
  if (!user || user.emailVerifiedAt) return false;

  await deliverAccountToken({
    userId: user.id,
    kind: "email_verification",
    email: user.email,
    deliver: (token) => sendVerificationEmail({ to: user.email, token }),
  });
  return true;
}

export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = normalizeAccountEmail(rawEmail);
  const user = await db.query.users.findFirst({
    where: and(eq(users.email, email), eq(users.status, "active")),
  });
  if (!user) return;

  await deliverAccountToken({
    userId: user.id,
    kind: "password_reset",
    email: user.email,
    deliver: (token) => sendPasswordResetEmail({ to: user.email, token }),
  });
}

export async function requestEmailChange(
  userId: number,
  rawEmail: string,
): Promise<"same" | "taken" | "sent" | "missing"> {
  const email = normalizeAccountEmail(rawEmail);
  const user = await activeUserForAccountToken(userId);
  if (!user) return "missing";
  if (user.email === email) return "same";

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return "taken";

  await deliverAccountToken({
    userId: user.id,
    kind: "email_change",
    email,
    deliver: (token) => sendEmailChangeVerification({ to: email, token }),
  });
  return "sent";
}

export async function verifyEmailToken(
  token: string,
): Promise<"verified" | "changed" | "invalid"> {
  const verification = await consumeAccountToken(token, "email_verification");
  if (verification) {
    const [user] = await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(
        and(
          eq(users.id, verification.userId),
          eq(users.email, verification.email),
          eq(users.status, "active"),
        ),
      )
      .returning({ id: users.id });
    return user ? "verified" : "invalid";
  }

  const change = await consumeAccountToken(token, "email_change");
  if (!change) return "invalid";

  try {
    const [user] = await db
      .update(users)
      .set({ email: change.email, emailVerifiedAt: new Date() })
      .where(and(eq(users.id, change.userId), eq(users.status, "active")))
      .returning({ id: users.id });
    return user ? "changed" : "invalid";
  } catch (error) {
    // A rare competing signup can take the address after the link was issued.
    // Do not expose database details or a different account's existence.
    console.error("[account] email change could not be completed:", error);
    return "invalid";
  }
}

export async function resetPasswordWithToken(
  token: string,
  passwordHash: string,
): Promise<boolean> {
  const reset = await consumeAccountToken(token, "password_reset");
  if (!reset) return false;

  const [user] = await db
    .update(users)
    .set({
      passwordHash,
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(and(eq(users.id, reset.userId), eq(users.status, "active")))
    .returning({ id: users.id });
  return user !== undefined;
}
