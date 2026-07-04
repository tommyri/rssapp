import { eq } from "drizzle-orm";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  ReadingPrefsForm,
} from "@/components/account-forms";
import { BackLink } from "@/components/back-link";
import { OpmlControls } from "@/components/opml-controls";
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
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <BackLink />
      </div>

      <ReadingPrefsForm autoReadDays={user?.settings.autoReadDays ?? null} />

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Subscriptions</h2>
        <p className="text-xs text-muted-foreground">
          Move your subscriptions in or out as an OPML file — the format every
          reader speaks.
        </p>
        <OpmlControls />
      </section>

      <ChangeEmailForm currentEmail={user?.email ?? ""} />
      <ChangePasswordForm />
    </div>
  );
}
