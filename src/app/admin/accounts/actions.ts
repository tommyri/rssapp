"use server";

import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { type AccountStatus, accountStatuses, users } from "@/db/schema";
import { getCurrentOwner } from "@/lib/current-user";
import { canReceiveOwnership } from "@/lib/owner-transfer";

export interface AccountStatusActionState {
  ok: boolean;
  message: string;
}

export interface OwnershipTransferActionState {
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

  const [account] = await db
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
    .returning({ email: users.email, status: users.status });

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
