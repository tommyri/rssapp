"use client";

import { useEffect } from "react";
import { OfflineMutationSync } from "@/components/offline-mutation-sync";
import { scheduleAutomaticOfflineDownload } from "@/lib/offline-background-download";
import {
  getOfflineReadLaterAutoDownloadLimit,
  OFFLINE_MUTATIONS_QUEUED_EVENT,
  setOfflineOwner,
  setOfflineReadLaterAutoDownloadLimit,
} from "@/lib/offline-library";

const BACKGROUND_SYNC_TAG = "rssapp-offline-mutations";

interface BackgroundSyncRegistration {
  sync?: { register: (tag: string) => Promise<void> };
}

/** Registers the offline shell only for an authenticated reader session. */
export function PwaRegister({ userId }: { userId: number }) {
  useEffect(() => {
    setOfflineOwner(userId);
    const automaticDownloadLimit = getOfflineReadLaterAutoDownloadLimit(userId);
    void setOfflineReadLaterAutoDownloadLimit(userId, automaticDownloadLimit)
      .then(() => scheduleAutomaticOfflineDownload(automaticDownloadLimit))
      .catch(() => {
        // The foreground open/reconnect refresh still works without IndexedDB.
      });

    function requestBackgroundSync() {
      if (!("serviceWorker" in navigator)) return;
      void navigator.serviceWorker.ready.then((registration) => {
        const sync = (registration as BackgroundSyncRegistration).sync;
        return sync?.register(BACKGROUND_SYNC_TAG).catch(() => {
          // Foreground reconnect sync remains the cross-browser fallback.
        });
      });
    }

    window.addEventListener(
      OFFLINE_MUTATIONS_QUEUED_EVENT,
      requestBackgroundSync,
    );
    if (!("serviceWorker" in navigator)) {
      return () =>
        window.removeEventListener(
          OFFLINE_MUTATIONS_QUEUED_EVENT,
          requestBackgroundSync,
        );
    }

    // Turbopack's dev module URLs change independently while the app is open.
    // A production offline cache must never serve an old module into `next dev`.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister()),
          ),
        );
      return () =>
        window.removeEventListener(
          OFFLINE_MUTATIONS_QUEUED_EVENT,
          requestBackgroundSync,
        );
    }

    const register = () => {
      void navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
      });
    };

    requestBackgroundSync();
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener(
        OFFLINE_MUTATIONS_QUEUED_EVENT,
        requestBackgroundSync,
      );
    };
  }, [userId]);

  return <OfflineMutationSync userId={userId} />;
}
