"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AccountActionState,
  updateNotificationPreferencesAction,
} from "@/app/settings/actions";

const initial: AccountActionState = { ok: true, message: "" };

/** Account-backed master event switch; delivery channels consume these events. */
export function NotificationPreferencesForm({
  inAppRuleAlerts,
}: {
  inAppRuleAlerts: boolean;
}) {
  const [enabled, setEnabled] = useState(inAppRuleAlerts);
  const [state, formAction, pending] = useActionState(
    updateNotificationPreferencesAction,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const didHydrate = useRef(false);
  const preferenceSnapshot = JSON.stringify({ enabled });

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
    }, 350);
    return () => window.clearTimeout(timer);
  }, [preferenceSnapshot, formAction]);

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => formAction(new FormData(event.currentTarget)));
      }}
    >
      <section className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <h3 className="font-medium">Rule notifications</h3>
          <p className="text-xs text-muted-foreground">
            Let notify rules collect matching articles. The notification inbox,
            browser push, and email digests all use this same collection.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 px-3 py-3 transition-colors hover:bg-accent/40">
          <input
            type="checkbox"
            name="ruleNotificationsEnabled"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">
              Collect rule notifications
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Keep a durable notification inbox whenever a notify rule matches a
              new article. Turning this off also stops email digests.
            </span>
          </span>
        </label>

        <p
          aria-live="polite"
          className={`text-sm ${state.ok || pending ? "text-muted-foreground" : "text-destructive"}`}
        >
          {pending ? "Saving…" : state.message || "Changes save automatically."}
        </p>
      </section>
    </form>
  );
}
