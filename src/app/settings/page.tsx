import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  ReadingPrefsForm,
} from "@/components/account-forms";
import { BackLink } from "@/components/back-link";
import { OpmlControls } from "@/components/opml-controls";
import { ReaderTypographyForm } from "@/components/reader-typography";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";

const escapeAttr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export default async function SettingsPage() {
  const userId = await getCurrentUserId();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  // Build an absolute bookmarklet from the request's own origin so it points at
  // this deployment wherever it's hosted.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const bookmarklet = `javascript:window.open('${origin}/save?url='+encodeURIComponent(location.href),'_blank');void 0`;
  const bookmarkletHtml = `<a href="${escapeAttr(bookmarklet)}" class="inline-flex cursor-grab items-center gap-1.5 rounded-md border border-border bg-accent/60 px-3 py-1.5 text-sm font-medium no-underline">Save to rssapp</a>`;

  return (
    <div className="mx-auto w-full max-w-md flex-1 space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <BackLink />
      </div>

      <ReadingPrefsForm
        autoReadDays={user?.settings.autoReadDays ?? null}
        collapseDuplicates={user?.settings.collapseDuplicates ?? true}
      />

      <section className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <h2 className="font-medium">Appearance</h2>
          <p className="text-xs text-muted-foreground">
            Choose light, dark, or follow your system.
          </p>
        </div>
        <ThemeToggle />
      </section>

      <ReaderTypographyForm />

      <section className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <h2 className="font-medium">Save from anywhere</h2>
          <p className="text-xs text-muted-foreground">
            Drag this button to your bookmarks bar, then click it on any web
            page to save it to your{" "}
            <Link href="/?view=later" className="underline">
              Read later
            </Link>
            . You can also paste a link into the field at the top of Read later.
          </p>
        </div>
        {/* Rendered as raw HTML so React doesn't scrub the javascript: URL; the
            bookmarklet is app-built and static. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, app-built bookmarklet */}
        <div dangerouslySetInnerHTML={{ __html: bookmarkletHtml }} />
      </section>

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
