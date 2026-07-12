"use client";

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
  updateReadingPrefsAction,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMBED_PROVIDER_LABELS,
  EMBED_PROVIDERS,
  type EmbedLoadingPreferences,
  type EmbedLoadMode,
} from "@/lib/embed-loading";
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

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState(changeEmailAction, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Email</h3>
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
      <SubmitButton label="Change email" />
      <Message state={state} />
    </form>
  );
}

export function ReadingPrefsForm({
  autoReadDays,
  collapseDuplicates,
  embedLoading,
}: {
  autoReadDays: number | null;
  collapseDuplicates: boolean;
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
  const [defaultMode, setDefaultMode] = useState<EmbedLoadMode>(
    embedLoading.default,
  );
  const [providers, setProviders] = useState(embedLoading.providers);
  const preferenceSnapshot = JSON.stringify({
    days,
    collapse,
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

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Password</h3>
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
      <SubmitButton label="Change password" />
      <Message state={state} />
    </form>
  );
}
