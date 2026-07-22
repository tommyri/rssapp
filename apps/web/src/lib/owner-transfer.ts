import type { AccountRole, AccountStatus } from "@/db/schema";

/** A new owner must be able to sign in and prove control of their address. */
export function canReceiveOwnership({
  role,
  status,
  emailVerifiedAt,
}: {
  role: AccountRole;
  status: AccountStatus;
  emailVerifiedAt: Date | null;
}): boolean {
  return role === "member" && status === "active" && emailVerifiedAt !== null;
}
