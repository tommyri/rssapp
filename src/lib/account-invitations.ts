import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountAuditEvents,
  accountInvites,
  instanceSettings,
  type RegistrationMode,
  registrationModes,
} from "@/db/schema";
import { accountAuditEventValues } from "@/lib/account-audit";
import {
  createAccountTokenSecret,
  hashAccountToken,
  normalizeAccountEmail,
} from "@/lib/account-tokens";
import { sendAccountInvitationEmail } from "@/lib/transactional-email";

export const ACCOUNT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingAccountInvite {
  id: number;
  email: string;
  expiresAt: Date;
  createdAt: Date;
}

export function isRegistrationMode(value: string): value is RegistrationMode {
  return registrationModes.some((mode) => mode === value);
}

export function registrationModeDescription(mode: RegistrationMode): string {
  switch (mode) {
    case "open":
      return "Anyone with an email address can create an account.";
    case "invite_only":
      return "Only people who receive an owner-issued invitation can create an account.";
    case "closed":
      return "New account creation is unavailable.";
  }
}

export function registrationAdmission(
  mode: RegistrationMode,
  hasValidInvitation: boolean,
): "allowed" | "closed" | "invite_required" {
  if (mode === "closed") return "closed";
  if (mode === "invite_only" && !hasValidInvitation) {
    return "invite_required";
  }
  return "allowed";
}

/** Missing configuration deliberately preserves the established public-signup default. */
export async function getRegistrationMode(): Promise<RegistrationMode> {
  const [settings] = await db
    .select({ registrationMode: instanceSettings.registrationMode })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, 1));
  return settings?.registrationMode ?? "open";
}

export async function setRegistrationMode({
  mode,
  actorUserId,
}: {
  mode: RegistrationMode;
  actorUserId: number;
}): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ registrationMode: instanceSettings.registrationMode })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, 1))
      .for("update");
    await tx
      .insert(instanceSettings)
      .values({ id: 1, registrationMode: mode, updatedAt: now })
      .onConflictDoUpdate({
        target: instanceSettings.id,
        set: { registrationMode: mode, updatedAt: now },
      });
    if (current?.registrationMode === mode) return;
    await tx.insert(accountAuditEvents).values(
      accountAuditEventValues({
        actorUserId,
        eventType: "registration_mode_changed",
        metadata: {
          previousRegistrationMode: current?.registrationMode ?? "open",
          registrationMode: mode,
        },
      }),
    );
  });
}

export async function listPendingAccountInvites(): Promise<
  PendingAccountInvite[]
> {
  return db
    .select({
      id: accountInvites.id,
      email: accountInvites.email,
      expiresAt: accountInvites.expiresAt,
      createdAt: accountInvites.createdAt,
    })
    .from(accountInvites)
    .where(
      and(
        isNull(accountInvites.acceptedAt),
        isNull(accountInvites.revokedAt),
        gt(accountInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(accountInvites.createdAt));
}

export async function issueAccountInvitation({
  rawEmail,
  invitedByUserId,
}: {
  rawEmail: string;
  invitedByUserId: number;
}): Promise<PendingAccountInvite> {
  const email = normalizeAccountEmail(rawEmail);
  const secret = createAccountTokenSecret();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCOUNT_INVITE_TTL_MS);

  const invite = await db.transaction(async (tx) => {
    // Repeated sends for one address are serialized even when the owner has
    // multiple console tabs open. The partial unique index is a second guard.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    const replaced = await tx
      .update(accountInvites)
      .set({ revokedAt: now })
      .where(
        and(
          eq(accountInvites.email, email),
          isNull(accountInvites.acceptedAt),
          isNull(accountInvites.revokedAt),
        ),
      )
      .returning({ id: accountInvites.id, email: accountInvites.email });
    if (replaced.length) {
      await tx.insert(accountAuditEvents).values(
        replaced.map((previous) =>
          accountAuditEventValues({
            actorUserId: invitedByUserId,
            eventType: "invitation_revoked",
            metadata: {
              invitationId: previous.id,
              invitationEmail: previous.email,
            },
          }),
        ),
      );
    }
    const [created] = await tx
      .insert(accountInvites)
      .values({
        email,
        tokenHash: hashAccountToken(secret),
        invitedByUserId,
        expiresAt,
      })
      .returning({
        id: accountInvites.id,
        email: accountInvites.email,
        expiresAt: accountInvites.expiresAt,
        createdAt: accountInvites.createdAt,
      });
    if (!created) throw new Error("Could not create account invitation.");
    await tx.insert(accountAuditEvents).values(
      accountAuditEventValues({
        actorUserId: invitedByUserId,
        eventType: "invitation_issued",
        metadata: { invitationId: created.id, invitationEmail: created.email },
      }),
    );
    return created;
  });

  try {
    await sendAccountInvitationEmail({ to: email, token: secret });
  } catch (error) {
    // A failed delivery must not leave a seemingly valid invite that cannot
    // actually be used or force the owner to wait before trying again.
    await revokeAccountInvitation(
      invite.id,
      invitedByUserId,
      "invitation_delivery_failed",
    );
    throw error;
  }

  return invite;
}

export async function revokeAccountInvitation(
  invitationId: number,
  actorUserId: number,
  eventType:
    | "invitation_revoked"
    | "invitation_delivery_failed" = "invitation_revoked",
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .update(accountInvites)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(accountInvites.id, invitationId),
          isNull(accountInvites.acceptedAt),
          isNull(accountInvites.revokedAt),
        ),
      )
      .returning({ id: accountInvites.id, email: accountInvites.email });
    if (!invite) return false;
    await tx.insert(accountAuditEvents).values(
      accountAuditEventValues({
        actorUserId,
        eventType,
        metadata: { invitationId: invite.id, invitationEmail: invite.email },
      }),
    );
    return true;
  });
}
