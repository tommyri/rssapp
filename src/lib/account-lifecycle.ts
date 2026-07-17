import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  activeUserForAccountToken,
  consumeAccountToken,
  issueAccountToken,
  normalizeAccountEmail,
} from "@/lib/account-tokens";
import {
  sendEmailChangeVerification,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/transactional-email";

export type StartRegistrationResult =
  | "created"
  | "verification_resent"
  | "already_verified";

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
}: {
  rawEmail: string;
  passwordHash: string;
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

  const [{ value: accountCount }] = await db
    .select({ value: count() })
    .from(users);
  const role = registrationRole(accountCount);
  let user: { id: number } | undefined;

  // The very first account owns a fresh deployment. A partial unique index
  // keeps concurrent first signups safe; every registration into an existing
  // installation is a member, even if a legacy operator still needs setup.
  if (role === "owner") {
    [user] = await db
      .insert(users)
      .values({ email, passwordHash, role })
      .onConflictDoNothing()
      .returning({ id: users.id });
  }
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ email, passwordHash, role: "member" })
      .onConflictDoNothing()
      .returning({ id: users.id });
  }

  // Another request can win the unique-email race between the lookup and the
  // insert. Treat it exactly like a normal repeat submission.
  if (!user) return startRegistration({ rawEmail: email, passwordHash });

  await sendEmailVerification(user.id);
  return "created";
}

export async function sendEmailVerification(userId: number): Promise<boolean> {
  const user = await activeUserForAccountToken(userId);
  if (!user || user.emailVerifiedAt) return false;

  const token = await issueAccountToken({
    userId: user.id,
    kind: "email_verification",
    email: user.email,
  });
  await sendVerificationEmail({ to: user.email, token });
  return true;
}

export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = normalizeAccountEmail(rawEmail);
  const user = await db.query.users.findFirst({
    where: and(eq(users.email, email), eq(users.status, "active")),
  });
  if (!user) return;

  const token = await issueAccountToken({
    userId: user.id,
    kind: "password_reset",
    email: user.email,
  });
  await sendPasswordResetEmail({ to: user.email, token });
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

  const token = await issueAccountToken({
    userId: user.id,
    kind: "email_change",
    email,
  });
  await sendEmailChangeVerification({ to: email, token });
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
