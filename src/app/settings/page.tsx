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
// Categorized settings (docs/design-ux.md): four anchored sections — behavior,
// presentation, data, identity — with a jump rail on desktop and pills on
// mobile. The ⌘K palette jumps to each anchor via the same shared list.
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

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
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <BackLink />
      </div>

      {/* Mobile: jump pills where the rail doesn't fit. */}
      <nav
        aria-label="Settings sections"
        className="mt-4 flex flex-wrap gap-1.5 md:hidden"
      >
        {SETTINGS_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mt-6 flex gap-8">
        {/* Desktop: sticky category rail. Plain anchors on purpose — no
            scrollspy until the page is long enough to lose your place. */}
        <nav
          aria-label="Settings sections"
          className="hidden w-40 shrink-0 md:block"
        >
          <div className="sticky top-6 space-y-0.5 text-sm">
            {SETTINGS_SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1 space-y-10">
          <SettingsSection id="reading" title="Reading" scope="Account">
            <ReadingPrefsForm
              autoReadDays={user?.settings.autoReadDays ?? null}
              collapseDuplicates={user?.settings.collapseDuplicates ?? true}
            />

            <section className="space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <h3 className="font-medium">Save from anywhere</h3>
                <p className="text-xs text-muted-foreground">
                  Drag this button to your bookmarks bar, then click it on any
                  web page to save it to your{" "}
                  <Link href="/?view=later" className="underline">
                    Read later
                  </Link>
                  . You can also paste a link into the field at the top of Read
                  later.
                </p>
              </div>
              {/* Rendered as raw HTML so React doesn't scrub the javascript: URL;
                  the bookmarklet is app-built and static. */}
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, app-built bookmarklet */}
              <div dangerouslySetInnerHTML={{ __html: bookmarkletHtml }} />
            </section>
          </SettingsSection>

          <SettingsSection
            id="appearance"
            title="Appearance"
            scope="This device"
          >
            <section className="space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <h3 className="font-medium">Theme</h3>
                <p className="text-xs text-muted-foreground">
                  Choose light, dark, or follow your system.
                </p>
              </div>
              <ThemeToggle />
            </section>

            <ReaderTypographyForm />
          </SettingsSection>

          <SettingsSection
            id="data"
            title="Subscriptions & data"
            scope="Account"
          >
            <section className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">OPML import & export</h3>
              <p className="text-xs text-muted-foreground">
                Move your subscriptions in or out as an OPML file — the format
                every reader speaks.
              </p>
              <OpmlControls />
            </section>
          </SettingsSection>

          <SettingsSection id="account" title="Account" scope="Account">
            <ChangeEmailForm currentEmail={user?.email ?? ""} />
            <ChangePasswordForm />
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}

/**
 * One settings category: a serif heading (matching the reader's view titles), a
 * scope tag answering "does this follow me to another device?", and its cards.
 * scroll-mt keeps the anchor target clear of the viewport edge when jumped to.
 */
function SettingsSection({
  id,
  title,
  scope,
  children,
}: {
  id: string;
  title: string;
  scope: "Account" | "This device";
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="flex items-baseline gap-2.5 pb-3">
        <h2 className="font-serif text-lg font-bold tracking-tight">{title}</h2>
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          {scope}
        </span>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
