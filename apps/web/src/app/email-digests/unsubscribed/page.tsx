import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DigestUnsubscribedPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-4 py-16">
      <section className="w-full space-y-5 rounded-xl border p-6">
        <div className="space-y-2">
          <h1 className="font-serif text-2xl font-bold">
            Email digests stopped
          </h1>
          <p className="text-sm text-muted-foreground">
            This account will no longer receive scheduled notification digests.
            You can enable them again at any time.
          </p>
        </div>
        <Button asChild>
          <Link href="/settings?section=notifications">
            Notification settings
          </Link>
        </Button>
      </section>
    </main>
  );
}
