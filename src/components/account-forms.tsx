"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import {
  type AccountActionState,
  changeEmailAction,
  changePasswordAction,
  deleteAccountAction,
  resendVerificationAction,
  updateProfileAction,
  updateReadingPrefsAction,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ArticleListDensity } from "@/lib/article-list-density";
import {
  EMBED_PROVIDER_LABELS,
  EMBED_PROVIDERS,
  type EmbedLoadingPreferences,
  type EmbedLoadMode,
} from "@/lib/embed-loading";
import { clearOfflineDeviceData } from "@/lib/offline-library";
import { DEFAULT_AUTO_READ_DAYS } from "@/lib/reading-prefs";

const initial: AccountActionState = { ok: true, message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Message({ state }: { state: AccountActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
    >
      {state.message}
    </p>
  );
}

function AutoSaveStatus({
  state,
  pending,
}: {
  state: AccountActionState;
  pending: boolean;
}) {
  const message = pending
    ? "Saving…"
    : state.message || "Changes save automatically.";
  return (
    <p
      aria-live="polite"
      className={`text-sm ${state.ok || pending ? "text-muted-foreground" : "text-destructive"}`}
    >
      {message}
    </p>
  );
}

export function ChangeEmailForm({
  currentEmail,
  emailVerified,
  hasPassword,
}: {
  currentEmail: string;
  emailVerified: boolean;
  hasPassword: boolean;
}) {
  const [state, formAction] = useActionState(changeEmailAction, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Email</h3>
      <p className="text-xs text-muted-foreground">
        {emailVerified
          ? "Verified email address."
          : "Your email still needs verification."}
      </p>
      <div className="space-y-2">
        <Label htmlFor="email">New email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={currentEmail}
          autoComplete="email"
          required
        />
      </div>
      {hasPassword ? (
        <div className="space-y-2">
          <Label htmlFor="email-current">Current password</Label>
          <Input
            id="email-current"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Your current email stays active until you confirm the new one.
      </p>
      <SubmitButton label="Send confirmation email" />
      <Message state={state} />
    </form>
  );
}

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, formAction, isPending] = useActionState(
    updateProfileAction,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const didHydrate = useRef(false);
  const [name, setName] = useState(displayName);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }
    // Keep the client-side limit in step with the server validation even if a
    // browser bypasses the input's maxLength attribute.
    if (name.length > 80) return;
    const form = formRef.current;
    if (!form) return;
    const timer = window.setTimeout(() => {
      startTransition(() => formAction(new FormData(form)));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [formAction, name]);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => formAction(new FormData(event.currentTarget)));
      }}
      className="space-y-3 rounded-lg border p-4"
    >
      <div className="space-y-1">
        <h3 className="font-medium">Profile</h3>
        <p className="text-xs text-muted-foreground">
          A name is optional and stays private to your account.
        </p>
      </div>
      <div className="max-w-sm space-y-2">
        <Label htmlFor="displayName">Name</Label>
        <Input
          id="displayName"
          name="displayName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          maxLength={80}
          placeholder="Optional"
        />
      </div>
      <AutoSaveStatus state={state} pending={isPending} />
    </form>
  );
}

export function EmailVerificationForm({ verified }: { verified: boolean }) {
  const [state, formAction] = useActionState(resendVerificationAction, initial);
  if (verified) return null;

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Verify your email</h3>
        <p className="text-xs text-muted-foreground">
          Confirm your address to protect account recovery and future sign-ins.
        </p>
      </div>
      <SubmitButton label="Resend verification email" />
      <Message state={state} />
    </form>
  );
}

export function ReadingPrefsForm({
  autoReadDays,
  collapseDuplicates,
  articleListDensity,
  embedLoading,
}: {
  autoReadDays: number | null;
  collapseDuplicates: boolean;
  articleListDensity: ArticleListDensity;
  embedLoading: EmbedLoadingPreferences;
}) {
  const [state, formAction, isPending] = useActionState(
    updateReadingPrefsAction,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const didHydrate = useRef(false);
  // Controlled so an autosave response can never restore stale server props.
  const [days, setDays] = useState(
    autoReadDays == null
      ? String(DEFAULT_AUTO_READ_DAYS)
      : String(autoReadDays),
  );
  const [collapse, setCollapse] = useState(collapseDuplicates);
  const [density, setDensity] =
    useState<ArticleListDensity>(articleListDensity);
  const [defaultMode, setDefaultMode] = useState<EmbedLoadMode>(
    embedLoading.default,
  );
  const [providers, setProviders] = useState(embedLoading.providers);
  const preferenceSnapshot = JSON.stringify({
    days,
    collapse,
    density,
    defaultMode,
    providers,
  });

  useEffect(() => {
    if (!preferenceSnapshot) return;
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }
    const form = formRef.current;
    if (!form) return;
    const timer = window.setTimeout(() => {
      startTransition(() => formAction(new FormData(form)));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [preferenceSnapshot, formAction]);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => formAction(new FormData(event.currentTarget)));
      }}
      className="space-y-4"
    >
      <section className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="font-medium">Article list</h3>
          <p className="text-xs text-muted-foreground">
            Control how much information each collapsed article row shows. Open
            articles always keep the same comfortable reading layout.
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Density</legend>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="articleListDensity"
              value="comfortable"
              checked={density === "comfortable"}
              onChange={() => setDensity("comfortable")}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block text-sm">Comfortable</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Two-line previews and the original row spacing.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="articleListDensity"
              value="compact"
              checked={density === "compact"}
              onChange={() => setDensity("compact")}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block text-sm">Compact</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Tighter rows and one-line previews for faster scanning.
              </span>
            </span>
          </label>
        </fieldset>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <h3 className="font-medium">Unread management</h3>
        <div className="space-y-2">
          <Label htmlFor="autoReadDays">
            Auto-mark articles read after (days)
          </Label>
          <Input
            id="autoReadDays"
            name="autoReadDays"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            placeholder={String(DEFAULT_AUTO_READ_DAYS)}
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">
            Applies to every feed unless you override it per feed on the Manage
            feeds page. Leave empty to use the {DEFAULT_AUTO_READ_DAYS}-day
            default.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              name="collapseDuplicates"
              checked={collapse}
              onChange={(e) => setCollapse(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block text-sm">Collapse duplicate articles</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                When the same story arrives from several feeds, show it once in
                All and folder views — tagged with the other feeds. Reading it
                marks every copy read.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="font-medium">Embedded media</h3>
          <p className="text-xs text-muted-foreground">
            Choose when trusted third-party embeds may load. Click-to-load keeps
            requests to YouTube, Vimeo, and X out of the reading page until you
            ask for them.
          </p>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Default behavior</legend>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="embedDefault"
              value="click"
              checked={defaultMode === "click"}
              onChange={() => setDefaultMode("click")}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block text-sm">Click to load</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Privacy-preserving default. Every embed starts as a light
                placeholder.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name="embedDefault"
              value="auto"
              checked={defaultMode === "auto"}
              onChange={() => setDefaultMode("auto")}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block text-sm">Auto-load trusted embeds</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Load supported embeds when an article opens.
              </span>
            </span>
          </label>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Platform overrides</legend>
          <p className="text-xs text-muted-foreground">
            Override the default for a platform without affecting the others.
          </p>
          <div className="space-y-2">
            {EMBED_PROVIDERS.map((provider) => (
              <label
                key={provider}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>{EMBED_PROVIDER_LABELS[provider]}</span>
                <select
                  name={`embedProvider-${provider}`}
                  value={providers[provider] ?? "inherit"}
                  onChange={(event) => {
                    const value = event.target.value;
                    setProviders((current) => {
                      const next = { ...current };
                      if (value === "inherit") delete next[provider];
                      else next[provider] = value as EmbedLoadMode;
                      return next;
                    });
                  }}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  <option value="inherit">Use default</option>
                  <option value="click">Click to load</option>
                  <option value="auto">Auto-load</option>
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <AutoSaveStatus state={state} pending={isPending} />
    </form>
  );
}

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction] = useActionState(changePasswordAction, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Password</h3>
      {hasPassword ? (
        <div className="space-y-2">
          <Label htmlFor="pw-current">Current password</Label>
          <Input
            id="pw-current"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Set a password if you would also like to sign in without Google.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="pw-new">New password</Label>
        <Input
          id="pw-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-confirm">Confirm new password</Label>
        <Input
          id="pw-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <SubmitButton label={hasPassword ? "Change password" : "Set password"} />
      <Message state={state} />
    </form>
  );
}

export function DeleteAccountForm({
  email,
  hasPassword,
  isOwner,
  userId,
}: {
  email: string;
  hasPassword: boolean;
  isOwner: boolean;
  userId: number;
}) {
  const [state, formAction, pending] = useActionState(
    deleteAccountAction,
    initial,
  );
  const [clearingDeviceData, setClearingDeviceData] = useState(false);

  useEffect(() => {
    if (!state.ok || state.message !== "Account deleted.") return;

    let active = true;
    setClearingDeviceData(true);
    const redirectToLogin = () => {
      if (!active) return;
      active = false;
      window.location.assign("/login?notice=account-deleted");
    };
    // Device storage cleanup is best effort: an unavailable IndexedDB must never
    // strand someone on a deleted account page.
    const fallback = window.setTimeout(redirectToLogin, 1_000);
    void clearOfflineDeviceData(userId)
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(fallback);
        redirectToLogin();
      });

    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, [state.message, state.ok, userId]);

  return (
    <section className="space-y-4 rounded-lg border border-destructive/40 p-4">
      <div className="space-y-1">
        <h3 className="font-medium text-destructive">Delete account</h3>
        <p className="text-xs text-muted-foreground">
          This permanently deletes your account and all of your subscriptions,
          reading state, saved pages, labels, rules, highlights, and sign-in
          methods. This cannot be undone.
        </p>
      </div>

      {isOwner ? (
        <p className="text-sm text-muted-foreground">
          Transfer ownership in{" "}
          <Link href="/admin/accounts" className="underline">
            Accounts
          </Link>{" "}
          before deleting this account.
        </p>
      ) : (
        <form action={formAction} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Download a{" "}
            <Link href="/settings?section=data" className="underline">
              backup
            </Link>{" "}
            first if you may want this data later.
          </p>
          <div className="space-y-2">
            <Label htmlFor="delete-email">Your email address</Label>
            <Input
              id="delete-email"
              name="confirmationEmail"
              type="email"
              autoComplete="email"
              placeholder={email}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
            <Input
              id="delete-confirmation"
              name="confirmation"
              autoComplete="off"
              required
            />
          </div>
          {hasPassword ? (
            <div className="space-y-2">
              <Label htmlFor="delete-current-password">Current password</Label>
              <Input
                id="delete-current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
          ) : null}
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={pending || clearingDeviceData}
          >
            {pending || clearingDeviceData ? "Deleting…" : "Delete account"}
          </Button>
          <Message state={state} />
        </form>
      )}
    </section>
  );
}
