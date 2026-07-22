import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountInvites,
  instanceSettings,
  type OAuthIdentityProvider,
  oauthIdentities,
  users,
} from "@/db/schema";
import { registrationAdmission } from "@/lib/account-invitations";
import { registrationRole } from "@/lib/account-lifecycle";
import {
  hashAccountToken,
  isAccountTokenSecret,
  normalizeAccountEmail,
} from "@/lib/account-tokens";

export interface VerifiedNativeProviderIdentity {
  provider: OAuthIdentityProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

export interface NativeProviderAccount {
  id: number;
  email: string;
  displayName: string | null;
  sessionVersion: number;
}

export type NativeProviderAccountResult =
  | { kind: "account"; account: NativeProviderAccount }
  | {
      kind:
        | "account_unavailable"
        | "email_required"
        | "link_required"
        | "registration_closed"
        | "invite_required";
    };

function normalizedDisplayName(value: string | null): string | null {
  const name = value?.trim().replace(/\s+/g, " ");
  return name ? name.slice(0, 100) : null;
}

async function activeAccount(
  userId: number,
): Promise<NativeProviderAccount | null> {
  const account = await db.query.users.findFirst({
    columns: {
      id: true,
      email: true,
      displayName: true,
      sessionVersion: true,
    },
    where: and(eq(users.id, userId), eq(users.status, "active")),
  });
  return account ?? null;
}

/**
 * Resolve a verified provider subject without ever auto-merging by email.
 * A matching address must explicitly link the provider from its existing
 * account, preserving the same anti-takeover rule as browser Google auth.
 */
export async function resolveNativeProviderAccount({
  identity,
  inviteToken,
}: {
  identity: VerifiedNativeProviderIdentity;
  inviteToken?: string;
}): Promise<NativeProviderAccountResult> {
  const known = await db.query.oauthIdentities.findFirst({
    columns: { userId: true },
    where: and(
      eq(oauthIdentities.provider, identity.provider),
      eq(oauthIdentities.providerAccountId, identity.subject),
    ),
  });
  if (known) {
    const account = await activeAccount(known.userId);
    return account
      ? { kind: "account", account }
      : { kind: "account_unavailable" };
  }

  if (!identity.email || !identity.emailVerified) {
    return { kind: "email_required" };
  }
  const email = normalizeAccountEmail(identity.email);
  const invitationTokenHash =
    inviteToken && isAccountTokenSecret(inviteToken)
      ? hashAccountToken(inviteToken)
      : null;
  const displayName = normalizedDisplayName(identity.displayName);
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${identity.provider}:${identity.subject}`}))`,
    );
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);

    const [racedIdentity] = await tx
      .select({ userId: oauthIdentities.userId })
      .from(oauthIdentities)
      .where(
        and(
          eq(oauthIdentities.provider, identity.provider),
          eq(oauthIdentities.providerAccountId, identity.subject),
        ),
      )
      .for("update");
    if (racedIdentity) {
      return { kind: "raced_identity" as const, userId: racedIdentity.userId };
    }

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
    if (admission === "closed") return { kind: "registration_closed" as const };
    if (admission === "invite_required") {
      return { kind: "invite_required" as const };
    }

    const [{ value: accountCount }] = await tx
      .select({ value: count() })
      .from(users);
    const preferredRole = registrationRole(accountCount);
    let account: NativeProviderAccount | undefined;
    if (preferredRole === "owner") {
      [account] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: null,
          emailVerifiedAt: now,
          displayName,
          role: "owner",
        })
        .onConflictDoNothing()
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          sessionVersion: users.sessionVersion,
        });
    }
    if (!account) {
      [account] = await tx
        .insert(users)
        .values({
          email,
          passwordHash: null,
          emailVerifiedAt: now,
          displayName,
          role: "member",
        })
        .onConflictDoNothing()
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          sessionVersion: users.sessionVersion,
        });
    }
    if (!account) return { kind: "link_required" as const };

    await tx.insert(oauthIdentities).values({
      userId: account.id,
      provider: identity.provider,
      providerAccountId: identity.subject,
    });
    if (invitation) {
      await tx
        .update(accountInvites)
        .set({ acceptedAt: now })
        .where(eq(accountInvites.id, invitation.id));
    }
    return { kind: "account" as const, account };
  });

  if (result.kind === "raced_identity") {
    const account = await activeAccount(result.userId);
    return account
      ? { kind: "account", account }
      : { kind: "account_unavailable" };
  }
  return result;
}
