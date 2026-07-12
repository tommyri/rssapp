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
import { normalizeEmbedLoadingPreferences } from "@/lib/embed-loading";
// Categorized settings (docs/design-ux.md): the rail/pills are a selector, not
// a scroll shortcut — one category renders at a time, driven by ?section=, so
// switching never moves the page. URL-addressable: refresh, back, and the ⌘K
// palette all land on the right category.
import {
  parseSettingsSection,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
  settingsSectionHref,
} from "@/lib/settings-sections";

const escapeAttr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Does the setting follow the account (Postgres) or stay on this device? */
const SECTION_SCOPE: Record<SettingsSectionId, "Account" | "This device"> = {
  reading: "Account",
  appearance: "This device",
  data: "Account",
  account: "Account",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  const active = parseSettingsSection(params.section);
  const activeLabel =
    SETTINGS_SECTIONS.find((s) => s.id === active)?.label ?? "Settings";

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

  const sectionContent: Record<SettingsSectionId, React.ReactNode> = {
    reading: (
      <>
        <ReadingPrefsForm
          autoReadDays={user?.settings.autoReadDays ?? null}
          collapseDuplicates={user?.settings.collapseDuplicates ?? true}
          embedLoading={normalizeEmbedLoadingPreferences(
            user?.settings.embedLoading,
          )}
        />

        <section className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1">
            <h3 className="font-medium">Save from anywhere</h3>
            <p className="text-xs text-muted-foreground">
              Drag this button to your bookmarks bar, then click it on any web
              page to save it to your{" "}
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
      </>
    ),
    appearance: (
      <>
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
      </>
    ),
    data: (
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">OPML import & export</h3>
        <p className="text-xs text-muted-foreground">
          Move your subscriptions in or out as an OPML file — the format every
          reader speaks.
        </p>
        <OpmlControls />
      </section>
    ),
    account: (
      <>
        <ChangeEmailForm currentEmail={user?.email ?? ""} />
        <ChangePasswordForm />
      </>
    ),
  };

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <BackLink />
      </div>

      {/* Mobile: the selector as pills. */}
      <nav
        aria-label="Settings sections"
        className="mt-4 flex flex-wrap gap-1.5 md:hidden"
      >
        {SETTINGS_SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={settingsSectionHref(s.id)}
            scroll={false}
            aria-current={s.id === active ? "page" : undefined}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              s.id === active
                ? "border-primary bg-accent/60 text-foreground"
                : "border-border/70 text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 flex gap-8">
        {/* Desktop: the selector as a rail. scroll={false} everywhere — picking
            a category swaps the pane and must never move the page. */}
        <nav
          aria-label="Settings sections"
          className="hidden w-40 shrink-0 md:block"
        >
          <div className="sticky top-6 space-y-0.5 text-sm">
            {SETTINGS_SECTIONS.map((s) => (
              <Link
                key={s.id}
                href={settingsSectionHref(s.id)}
                scroll={false}
                aria-current={s.id === active ? "page" : undefined}
                className={`block rounded-md px-2 py-1 transition-colors ${
                  s.id === active
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5 pb-3">
            <h2 className="font-serif text-lg font-bold tracking-tight">
              {activeLabel}
            </h2>
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              {SECTION_SCOPE[active]}
            </span>
          </div>
          <div className="space-y-4">{sectionContent[active]}</div>
        </div>
      </div>
    </div>
  );
}
