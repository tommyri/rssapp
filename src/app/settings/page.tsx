import { eq } from "drizzle-orm";
import Link from "next/link";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  ReadingPrefsForm,
} from "@/components/account-forms";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  return (
    <div className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <Link href="/" className="text-sm text-primary underline">
          ← Back to reader
        </Link>
      </div>

      <ReadingPrefsForm autoReadDays={user?.settings.autoReadDays ?? null} />
      <ChangeEmailForm currentEmail={user?.email ?? ""} />
      <ChangePasswordForm />

      <p className="text-xs text-muted-foreground">
        Single-user app: there's no password reset. If you lose the password,
        clear the account directly in the database (see README) and register
        again.
      </p>
    </div>
  );
}
