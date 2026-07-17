"use server";

import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  type AccountStatus,
  accountAuditEvents,
  accountStatuses,
  users,
} from "@/db/schema";
import { accountAuditEventValues } from "@/lib/account-audit";
import {
  isRegistrationMode,
  issueAccountInvitation,
  registrationModeDescription,
  revokeAccountInvitation,
  setRegistrationMode,
} from "@/lib/account-invitations";
import { getCurrentOwner } from "@/lib/current-user";
import { canReceiveOwnership } from "@/lib/owner-transfer";
import { EmailDeliveryError } from "@/lib/transactional-email";

export interface AccountStatusActionState {
  ok: boolean;
  message: string;
}

export interface OwnershipTransferActionState {
  ok: boolean;
  message: string;
}

export interface RegistrationPolicyActionState {
  ok: boolean;
  message: string;
}

export interface AccountInviteActionState {
  ok: boolean;
  message: string;
}

function isAccountStatus(value: string): value is AccountStatus {
  return accountStatuses.some((status) => status === value);
}

export async function setAccountStatusAction(
  _prev: AccountStatusActionState,
  formData: FormData,
): Promise<AccountStatusActionState> {
  const owner = await getCurrentOwner();
  const accountId = Number(formData.get("accountId"));
  const status = String(formData.get("status") ?? "");
  if (
    !Number.isSafeInteger(accountId) ||
    accountId < 1 ||
    !isAccountStatus(status)
  ) {
    return { ok: false, message: "Choose a valid account and status." };
  }
  if (accountId === owner.id) {
    return { ok: false, message: "You cannot change your own account access." };
  }

  const account = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        status,
        // A resumed account must sign in again; an old session cannot spring back
        // to life after its owner deliberately suspended it.
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(
        and(
          eq(users.id, accountId),
          ne(users.id, owner.id),
          eq(users.role, "member"),
        ),
      )
      .returning({ id: users.id, email: users.email, status: users.status });
    if (!updated) return null;
    await tx.insert(accountAuditEvents).values(
      accountAuditEventValues({
        actorUserId: owner.id,
        targetUserId: updated.id,
        eventType:
          updated.status === "suspended"
            ? "account_suspended"
            : "account_restored",
      }),
    );
    return updated;
  });

  if (!account) {
    return { ok: false, message: "That account is no longer available." };
  }

  revalidatePath("/admin/accounts");
  return {
    ok: true,
    message:
      account.status === "suspended"
        ? `${account.email} has been suspended and signed out.`
        : `${account.email} can sign in again.`,
  };
}

export async function transferOwnershipAction(
  _prev: OwnershipTransferActionState,
  formData: FormData,
): Promise<OwnershipTransferActionState> {
  const owner = await getCurrentOwner();
  const accountId = Number(formData.get("accountId"));
  if (!Number.isSafeInteger(accountId) || accountId < 1) {
    return { ok: false, message: "Choose a valid account." };
  }
  if (accountId === owner.id) {
    return { ok: false, message: "You already own this deployment." };
  }

  const result = await db.transaction(async (tx) => {
    // This lock is shared with the break-glass CLI, so ownership handovers
    // cannot deadlock when an operator and the console act at the same time.
    await tx.execute(sql`select pg_advisory_xact_lock(795509)`);
    // Lock the current owner first. A concurrent transfer or operator command
    // then sees the current role rather than creating an ambiguous handover.
    const [currentOwner] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, owner.id))
      .for("update");
    if (!currentOwner || currentOwner.role !== "owner") return null;

    const [recipient] = await tx
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(
        and(
          eq(users.id, accountId),
          eq(users.role, "member"),
          eq(users.status, "active"),
          isNotNull(users.emailVerifiedAt),
        ),
      )
      .for("update");
    if (!recipient || !canReceiveOwnership(recipient)) return null;

    // The partial unique index permits at most one owner. Demoting first keeps
    // that invariant intact; this transaction never exposes an ownerless state.
    await tx
      .update(users)
      .set({
        role: "member",
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, currentOwner.id));
    await tx
      .update(users)
      .set({
        role: "owner",
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, recipient.id));
    await tx.insert(accountAuditEvents).values(
      accountAuditEventValues({
        actorUserId: currentOwner.id,
        targetUserId: recipient.id,
        eventType: "ownership_transferred",
      }),
    );

    return recipient.email;
  });

  if (!result) {
    return {
      ok: false,
      message:
        "That account must be an active, verified member before it can become owner.",
    };
  }

  revalidatePath("/admin/accounts");
  revalidatePath("/");
  redirect(
    `/login?notice=ownership-transferred&owner=${encodeURIComponent(result)}`,
  );
}

export async function setRegistrationModeAction(
  _prev: RegistrationPolicyActionState,
  formData: FormData,
): Promise<RegistrationPolicyActionState> {
  const owner = await getCurrentOwner();
  const mode = String(formData.get("registrationMode") ?? "");
  if (!isRegistrationMode(mode)) {
    return { ok: false, message: "Choose a valid registration policy." };
  }

  await setRegistrationMode({ mode, actorUserId: owner.id });
  revalidatePath("/admin/accounts");
  revalidatePath("/signup");
  return { ok: true, message: registrationModeDescription(mode) };
}

export async function issueAccountInviteAction(
  _prev: AccountInviteActionState,
  formData: FormData,
): Promise<AccountInviteActionState> {
  const owner = await getCurrentOwner();
  const email = z
    .string()
    .email()
    .safeParse(
      String(formData.get("email") ?? "")
        .toLowerCase()
        .trim(),
    );
  if (!email.success) return { ok: false, message: "Enter a valid email." };
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email.data),
  });
  if (existing) {
    return {
      ok: false,
      message: "That email already belongs to an account.",
    };
  }

  try {
    await issueAccountInvitation({
      rawEmail: email.data,
      invitedByUserId: owner.id,
    });
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      console.error("[account] invitation email unavailable:", error);
      return {
        ok: false,
        message:
          "We could not send an invitation right now. Try again shortly.",
      };
    }
    console.error("[account] invitation failed:", error);
    return { ok: false, message: "We could not create that invitation." };
  }

  revalidatePath("/admin/accounts");
  return {
    ok: true,
    message: `Invitation sent to ${email.data}. It expires in 7 days.`,
  };
}

export async function revokeAccountInviteAction(
  _prev: AccountInviteActionState,
  formData: FormData,
): Promise<AccountInviteActionState> {
  const owner = await getCurrentOwner();
  const invitationId = Number(formData.get("invitationId"));
  if (!Number.isSafeInteger(invitationId) || invitationId < 1) {
    return { ok: false, message: "Choose a valid invitation." };
  }

  const revoked = await revokeAccountInvitation(invitationId, owner.id);
  if (!revoked) {
    return { ok: false, message: "That invitation is no longer available." };
  }
  revalidatePath("/admin/accounts");
  return { ok: true, message: "Invitation revoked." };
}
