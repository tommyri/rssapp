import Link from "next/link";
import { Button } from "@/components/ui/button";
import { verifyDigestUnsubscribeToken } from "@/lib/notification-digest-links";
import { unsubscribeNotificationDigestAction } from "./actions";

export default async function DigestUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; invalid?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const valid = Boolean(verifyDigestUnsubscribeToken(token));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-16">
      <section className="w-full space-y-5 rounded-xl border p-6">
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-bold">Email digests</h1>
          <p className="text-sm text-muted-foreground">
            {valid
              ? "Stop scheduled notification digests for this account? In-app and browser notifications will not be changed."
              : "This unsubscribe link is invalid or has expired. You can still change email digests from notification settings after signing in."}
          </p>
        </div>
        {valid ? (
          <form action={unsubscribeNotificationDigestAction}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit">Stop email digests</Button>
          </form>
        ) : (
          <Button asChild>
            <Link href="/settings?section=notifications">Open settings</Link>
          </Button>
        )}
      </section>
    </main>
  );
}
