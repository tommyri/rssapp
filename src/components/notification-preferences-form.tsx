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

/** Account-backed, debounced preference control — settings never need a Save button. */
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
          <h3 className="font-medium">Rule alerts</h3>
          <p className="text-xs text-muted-foreground">
            Let rules add matching articles to your in-app notifications. You
            can still keep your mute, read, star, and label rules active when
            alerts are off.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 px-3 py-3 transition-colors hover:bg-accent/40">
          <input
            type="checkbox"
            name="inAppRuleAlerts"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">
              In-app notifications
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              See a dedicated inbox and unread badge whenever a notify rule
              matches a new article.
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
