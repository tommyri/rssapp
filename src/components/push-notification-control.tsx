"use client";

import { useEffect, useState } from "react";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";

type PushStatus =
  | "checking"
  | "unavailable"
  | "unsupported"
  | "blocked"
  | "ready"
  | "enabled";

/** Convert the deployment's URL-safe VAPID key for PushManager.subscribe(). */
export function vapidKeyBytes(publicKey: string): ArrayBuffer {
  const padded = publicKey.padEnd(
    publicKey.length + ((4 - (publicKey.length % 4)) % 4),
    "=",
  );
  const base64 = padded.replaceAll("-", "+").replaceAll("_", "/");
  const decoded = window.atob(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes.buffer;
}

function supportsPushNotifications(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return (
    existing ??
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
  );
}

/** Manage an opt-in browser push endpoint without enabling alerts by default. */
export function PushNotificationControl({
  publicKey,
}: {
  publicKey: string | null;
}) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [message, setMessage] = useState("Checking this browser…");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setStatus("unavailable");
      setMessage("Browser push has not been configured for this reader yet.");
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      setStatus("unavailable");
      setMessage("Browser push is available in a production build.");
      return;
    }
    if (!supportsPushNotifications()) {
      setStatus("unsupported");
      setMessage("This browser does not support push notifications.");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      setMessage("Notifications are blocked in this browser's site settings.");
      return;
    }

    let cancelled = false;
    void pushRegistration()
      .then((registration) => registration.pushManager.getSubscription())
      .then((current) => {
        if (cancelled) return;
        setSubscription(current);
        if (current) {
          setStatus("enabled");
          setMessage("Browser notifications are on for this device.");
        } else {
          setStatus("ready");
          setMessage("Get a concise alert when new articles match your rules.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("unavailable");
        setMessage("Browser push could not be set up on this device.");
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function enable() {
    if (!publicKey || !supportsPushNotifications()) return;
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("blocked");
        setMessage(
          "Notifications are blocked in this browser's site settings.",
        );
        return;
      }
      const registration = await pushRegistration();
      const current = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(publicKey),
      });
      const result = await savePushSubscriptionAction(current.toJSON());
      if (!result.ok) {
        await current.unsubscribe();
        setStatus("ready");
        setMessage(result.message);
        return;
      }
      setSubscription(current);
      setStatus("enabled");
      setMessage(result.message);
    } catch {
      setStatus("ready");
      setMessage("We could not enable browser notifications. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setPending(true);
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe().catch(() => false);
      const result = await removePushSubscriptionAction(endpoint);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setSubscription(null);
      setStatus("ready");
      setMessage(result.message);
    } catch {
      setMessage("We could not turn off browser notifications. Try again.");
    } finally {
      setPending(false);
    }
  }

  const canEnable = status === "ready";
  const canDisable = status === "enabled" && subscription !== null;
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Browser notifications</h3>
        <p className="text-xs text-muted-foreground">
          Optional alerts for this device. Multiple matching articles are
          grouped into one notification, and every alert remains in your inbox.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canEnable ? (
          <Button type="button" onClick={enable} disabled={pending}>
            {pending ? "Enabling…" : "Enable on this device"}
          </Button>
        ) : null}
        {canDisable ? (
          <Button
            type="button"
            variant="outline"
            onClick={disable}
            disabled={pending}
          >
            {pending ? "Turning off…" : "Turn off on this device"}
          </Button>
        ) : null}
      </div>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
