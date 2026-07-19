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
  type NotificationDigestActionState,
  sendTestNotificationDigestAction,
  updateNotificationDigestAction,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DigestMode = "off" | "daily" | "weekly";

const initialSave: NotificationDigestActionState = {
  ok: true,
  message: "",
};
const initialTest: AccountActionState = { ok: true, message: "" };
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

function timeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function localDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function deliveryStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return (
    {
      pending: "Waiting to send",
      processing: "Sending",
      retrying: "Retry scheduled",
      sent: "Delivered",
      skipped: "Skipped",
      failed: "Delivery failed",
    }[status] ?? null
  );
}

export function EmailDigestPreferencesForm({
  configured,
  enabled,
  cadence,
  timezone: initialTimezone,
  deliveryHour,
  deliveryMinute,
  weekday: initialWeekday,
  nextRunAt,
  lastSentAt,
  lastDeliveryStatus,
  lastDeliveryError,
  email,
  emailVerified,
  emailAvailable,
  ruleNotificationsEnabled,
}: {
  configured: boolean;
  enabled: boolean;
  cadence: "daily" | "weekly";
  timezone: string;
  deliveryHour: number;
  deliveryMinute: number;
  weekday: number;
  nextRunAt: string | null;
  lastSentAt: string | null;
  lastDeliveryStatus: string | null;
  lastDeliveryError: string | null;
  email: string;
  emailVerified: boolean;
  emailAvailable: boolean;
  ruleNotificationsEnabled: boolean;
}) {
  const [mode, setMode] = useState<DigestMode>(enabled ? cadence : "off");
  const [timezone, setTimezone] = useState(initialTimezone);
  const [deliveryTime, setDeliveryTime] = useState(
    timeValue(deliveryHour, deliveryMinute),
  );
  const [weekday, setWeekday] = useState(initialWeekday);
  const [zones, setZones] = useState<string[]>([initialTimezone]);
  const [saveState, saveAction, savePending] = useActionState(
    updateNotificationDigestAction,
    initialSave,
  );
  const [testState, testAction, testPending] = useActionState(
    sendTestNotificationDigestAction,
    initialTest,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const didHydrate = useRef(false);
  const changedByUser = useRef(false);
  const available = ruleNotificationsEnabled && emailVerified && emailAvailable;

  useEffect(() => {
    const intl = Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    };
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const supported = intl.supportedValuesOf?.("timeZone") ?? [];
    const nextZones = Array.from(
      new Set([initialTimezone, detected, "UTC", ...supported]),
    ).sort();
    setZones(nextZones);
    if (!configured && initialTimezone === "UTC") setTimezone(detected);
  }, [configured, initialTimezone]);

  useEffect(() => {
    setMode(enabled ? cadence : "off");
  }, [enabled, cadence]);

  const snapshot = JSON.stringify({ mode, timezone, deliveryTime, weekday });
  useEffect(() => {
    if (!snapshot) return;
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }
    // Browser timezone detection should not create a disabled settings row.
    if (!configured && !changedByUser.current) return;
    const form = formRef.current;
    if (!form) return;
    const timer = window.setTimeout(() => {
      startTransition(() => saveAction(new FormData(form)));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [configured, saveAction, snapshot]);

  const markChanged = () => {
    changedByUser.current = true;
  };
  const effectiveNextRun =
    saveState.nextRunAt === undefined ? nextRunAt : saveState.nextRunAt;
  const nextLabel = localDate(effectiveNextRun);
  const lastSentLabel = localDate(lastSentAt);
  const statusLabel = deliveryStatusLabel(lastDeliveryStatus);

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Email digest</h3>
        <p className="text-xs text-muted-foreground">
          Receive unread rule notifications together at a predictable time.
          Sending a digest never marks them read.
        </p>
      </div>

      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(() => saveAction(new FormData(event.currentTarget)));
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="deliveryTime" value={deliveryTime} />
        <input type="hidden" name="weekday" value={weekday} />
        <input type="hidden" name="timezone" value={timezone} />
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Frequency</span>
          <select
            value={mode}
            disabled={!available}
            onChange={(event) => {
              markChanged();
              setMode(event.target.value as DigestMode);
            }}
            className={selectClass}
          >
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <label htmlFor="digest-delivery-time" className="space-y-1.5 text-sm">
          <span className="font-medium">Delivery time</span>
          <Input
            id="digest-delivery-time"
            type="time"
            value={deliveryTime}
            disabled={!available}
            onChange={(event) => {
              markChanged();
              setDeliveryTime(event.target.value);
            }}
          />
        </label>

        {mode === "weekly" ? (
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Delivery day</span>
            <select
              value={weekday}
              disabled={!available}
              onChange={(event) => {
                markChanged();
                setWeekday(Number(event.target.value));
              }}
              className={selectClass}
            >
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
              <option value="7">Sunday</option>
            </select>
          </label>
        ) : null}

        <label className="space-y-1.5 text-sm sm:col-span-2">
          <span className="font-medium">Timezone</span>
          <select
            value={timezone}
            disabled={!available}
            onChange={(event) => {
              markChanged();
              setTimezone(event.target.value);
            }}
            className={selectClass}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </form>

      <div className="rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
        <p>
          Destination: {email || "No account email"}
          {emailVerified ? " · Verified" : " · Verification required"}
        </p>
        {nextLabel && mode !== "off" ? <p>Next digest: {nextLabel}</p> : null}
        {lastSentLabel ? <p>Last delivered: {lastSentLabel}</p> : null}
        {statusLabel ? <p>Last delivery: {statusLabel}</p> : null}
        {lastDeliveryError &&
        (lastDeliveryStatus === "failed" ||
          lastDeliveryStatus === "retrying") ? (
          <p>Delivery detail: {lastDeliveryError}</p>
        ) : null}
      </div>

      {!ruleNotificationsEnabled ? (
        <p className="text-sm text-muted-foreground">
          Turn on rule notifications above before scheduling a digest.
        </p>
      ) : !emailVerified ? (
        <p className="text-sm text-muted-foreground">
          Verify your account email before scheduling or testing a digest.
        </p>
      ) : !emailAvailable ? (
        <p className="text-sm text-destructive">
          Email delivery is not configured for this deployment.
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-3">
        <form action={testAction}>
          <Button
            type="submit"
            variant="outline"
            disabled={!emailVerified || !emailAvailable || testPending}
          >
            {testPending ? "Sending…" : "Send test digest"}
          </Button>
        </form>
        <div className="space-y-1" aria-live="polite">
          <p
            className={`text-sm ${
              saveState.ok || savePending
                ? "text-muted-foreground"
                : "text-destructive"
            }`}
          >
            {savePending
              ? "Saving…"
              : saveState.message || "Changes save automatically."}
          </p>
          {testState.message ? (
            <p
              className={`text-sm ${
                testState.ok ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              {testState.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
