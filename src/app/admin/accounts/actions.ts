"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type AccountStatus, accountStatuses, users } from "@/db/schema";
import { getCurrentOwner } from "@/lib/current-user";

export interface AccountStatusActionState {
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
