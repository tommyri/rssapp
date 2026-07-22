import type { OfflineReadLaterAutoDownloadLimit } from "@/lib/offline-library";

export const OFFLINE_AUTOMATIC_DOWNLOAD_SYNC_TAG = "rssapp-offline-read-later";
export const OFFLINE_AUTOMATIC_DOWNLOAD_PERIODIC_SYNC_TAG =
  "rssapp-offline-read-later-periodic";

const PERIODIC_AUTO_DOWNLOAD_MIN_INTERVAL = 12 * 60 * 60 * 1000;

interface AutomaticDownloadRegistration extends ServiceWorkerRegistration {
  sync?: { register: (tag: string) => Promise<void> };
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
    unregister?: (tag: string) => Promise<void>;
  };
}

/**
 * Requests a refresh after the next connection and, where supported, at a
 * browser-chosen periodic interval. Foreground open/reconnect refresh remains
 * the dependable path when either browser API is unavailable.
 */
export function scheduleAutomaticOfflineDownload(
  limit: OfflineReadLaterAutoDownloadLimit,
): void {
  if (!("serviceWorker" in navigator)) return;

  void navigator.serviceWorker.ready
    .then((rawRegistration) => {
      const registration = rawRegistration as AutomaticDownloadRegistration;
      if (limit > 0 && registration.sync) {
        void registration.sync
          .register(OFFLINE_AUTOMATIC_DOWNLOAD_SYNC_TAG)
          .catch(() => {
            // Foreground reconnect refresh remains the cross-browser fallback.
          });
      }

      if (!registration.periodicSync) return;
      if (limit > 0) {
        void registration.periodicSync
          .register(OFFLINE_AUTOMATIC_DOWNLOAD_PERIODIC_SYNC_TAG, {
            minInterval: PERIODIC_AUTO_DOWNLOAD_MIN_INTERVAL,
          })
          .catch(() => {
            // Periodic Background Sync has deliberately limited availability.
          });
      } else {
        void registration.periodicSync
          .unregister?.(OFFLINE_AUTOMATIC_DOWNLOAD_PERIODIC_SYNC_TAG)
          .catch(() => {
            // A stale registration is harmless: the worker checks the limit.
          });
      }
    })
    .catch(() => {
      // Service worker registration is optional for normal reader use.
    });
}
