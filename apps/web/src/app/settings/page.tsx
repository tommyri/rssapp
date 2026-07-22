import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  DeleteAccountForm,
  EmailVerificationForm,
  ProfileForm,
  ReadingPrefsForm,
} from "@/components/account-forms";
import { AccountSessionControls } from "@/components/account-session-controls";
import { ApiAccessTokenControls } from "@/components/api-access-token-controls";
import { AppInformation } from "@/components/app-information";
import { BackLink } from "@/components/back-link";
import { BackupControls } from "@/components/backup-controls";
import { EmailDigestPreferencesForm } from "@/components/email-digest-preferences-form";
import { GoogleAccountLink } from "@/components/google-auth-controls";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { OpmlControls } from "@/components/opml-controls";
import { PushNotificationControl } from "@/components/push-notification-control";
import { ReaderTypographyForm } from "@/components/reader-typography";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/db";
import { users } from "@/db/schema";
import { listApiAccessTokens } from "@/lib/api-access-tokens";
import { normalizeArticleListDensity } from "@/lib/article-list-density";
import { listActiveAuthSessions } from "@/lib/auth-sessions";
import { getBuildIdentity } from "@/lib/build-identity";
import { getCurrentSessionId, getCurrentUserId } from "@/lib/current-user";
import { normalizeEmbedLoadingPreferences } from "@/lib/embed-loading";
import { hasGoogleIdentity } from "@/lib/google-auth";
import {
  googleAccountSettingsNotice,
  isGoogleAuthEnabled,
} from "@/lib/google-auth-config";
import { listActiveNativeAppSessions } from "@/lib/native-app-sessions";
import { getNotificationDigestPreferences } from "@/lib/notification-digests";
import { getVapidPublicKey } from "@/lib/push-notifications";
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
import { isEmailDeliveryAvailable } from "@/lib/transactional-email";

const escapeAttr = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const sessionDate = (date: Date) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);

/** Does the setting follow the account (Postgres) or stay on this device? */
const SECTION_SCOPE: Record<SettingsSectionId, "Account" | "This device"> = {
  reading: "Account",
  appearance: "This device",
  notifications: "Account",
  data: "Account",
  account: "Account",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; google?: string }>;
}) {
  const params = await searchParams;
  const buildIdentity = getBuildIdentity();
  const active = parseSettingsSection(params.section);
  const activeLabel =
    SETTINGS_SECTIONS.find((s) => s.id === active)?.label ?? "Settings";

  const userId = await getCurrentUserId();
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  const googleEnabled = isGoogleAuthEnabled();
  const googleConnected = googleEnabled
    ? await hasGoogleIdentity(userId)
    : false;
  const currentSessionId =
    active === "account" ? await getCurrentSessionId() : null;
  const accountSessions =
    active === "account" && user
      ? await listActiveAuthSessions({
          userId,
          sessionVersion: user.sessionVersion,
        })
      : [];
  const nativeAppSessions =
    active === "account" && user
      ? await listActiveNativeAppSessions({
          userId,
          sessionVersion: user.sessionVersion,
        })
      : [];
  const canManageSessions = Boolean(
    currentSessionId &&
      accountSessions.some(({ id }) => id === currentSessionId),
  );
  const apiAccessTokens =
    active === "account" ? await listApiAccessTokens(userId) : [];
  const digestPreferences =
    active === "notifications"
      ? await getNotificationDigestPreferences(userId)
      : null;

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
          articleListDensity={normalizeArticleListDensity(
            user?.settings.articleListDensity,
          )}
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
    notifications: (
      <div className="space-y-4">
        <NotificationPreferencesForm
          inAppRuleAlerts={user?.settings.inAppRuleAlerts ?? true}
        />
        <PushNotificationControl publicKey={getVapidPublicKey()} />
        {digestPreferences ? (
          <EmailDigestPreferencesForm
            {...digestPreferences}
            nextRunAt={digestPreferences.nextRunAt?.toISOString() ?? null}
            lastSentAt={digestPreferences.lastSentAt?.toISOString() ?? null}
            email={user?.email ?? ""}
            emailVerified={Boolean(user?.emailVerifiedAt)}
            emailAvailable={isEmailDeliveryAvailable()}
            ruleNotificationsEnabled={user?.settings.inAppRuleAlerts ?? true}
          />
        ) : null}
      </div>
    ),
    data: (
      <>
        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">OPML import & export</h3>
          <p className="text-xs text-muted-foreground">
            Move your subscriptions in or out as an OPML file — the format every
            reader speaks.
          </p>
          <OpmlControls />
        </section>
        <BackupControls userId={userId} />
      </>
    ),
    account: (
      <>
        <ProfileForm displayName={user?.displayName ?? ""} />
        <ChangeEmailForm
          currentEmail={user?.email ?? ""}
          emailVerified={Boolean(user?.emailVerifiedAt)}
          hasPassword={Boolean(user?.passwordHash)}
        />
        <EmailVerificationForm verified={Boolean(user?.emailVerifiedAt)} />
        <ChangePasswordForm hasPassword={Boolean(user?.passwordHash)} />
        <AccountSessionControls
          canManage={canManageSessions}
          sessions={accountSessions.map((session) => ({
            id: session.id,
            signedInAt: sessionDate(session.createdAt),
            isCurrent: session.id === currentSessionId,
          }))}
          nativeSessions={nativeAppSessions.map((session) => ({
            id: session.id,
            name: session.deviceName,
            signedInAt: sessionDate(session.createdAt),
            lastUsedAt: session.lastUsedAt
              ? sessionDate(session.lastUsedAt)
              : null,
          }))}
        />
        <ApiAccessTokenControls
          endpoint={`${origin}/api/greader`}
          tokens={apiAccessTokens.map((token) => ({
            id: token.id,
            name: token.name,
            tokenPrefix: token.tokenPrefix,
            createdAt: token.createdAt.toISOString(),
            lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          }))}
        />
        {googleEnabled ? (
          <GoogleAccountLink
            connected={googleConnected}
            hasPassword={Boolean(user?.passwordHash)}
            notice={googleAccountSettingsNotice(params.google)}
          />
        ) : null}
        <DeleteAccountForm
          email={user?.email ?? ""}
          hasPassword={Boolean(user?.passwordHash)}
          isOwner={user?.role === "owner"}
          userId={userId}
        />
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
          <AppInformation identity={buildIdentity} />
        </div>
      </div>
    </div>
  );
}
