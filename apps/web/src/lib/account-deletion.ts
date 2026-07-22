import type { AccountRole } from "@/db/schema";
import { normalizeAccountEmail } from "@/lib/account-tokens";

export function accountDeletionConfirmationError({
  role,
  accountEmail,
  typedEmail,
  confirmation,
}: {
  role: AccountRole;
  accountEmail: string;
  typedEmail: string;
  confirmation: string;
}): string | null {
  if (role === "owner") {
    return "Transfer ownership to an active, verified member before deleting this account.";
  }
  if (normalizeAccountEmail(typedEmail) !== accountEmail) {
    return "Enter your current email address to confirm account deletion.";
  }
  if (confirmation !== "DELETE") {
    return "Type DELETE to confirm account deletion.";
  }
  return null;
}
