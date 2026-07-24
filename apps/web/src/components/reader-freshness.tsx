"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";
import {
  READER_FRESHNESS_INTERVAL_MS,
  READER_RETURN_MINIMUM_MS,
} from "@/lib/reader-freshness";

/**
 * Keep an open web reader in step with native clients without maintaining a
 * permanent realtime connection. Hidden pages do no work; returning to the app
 * and a restrained visible-page interval refresh the current RSC snapshot.
 */
export function ReaderFreshness() {
  const router = useRouter();
  const lastRefreshAtRef = useRef(Date.now());
  const inactiveSinceRef = useRef<number | null>(null);

  useEffect(() => {
    function canRefresh() {
      return (
        document.visibilityState === "visible" &&
        window.navigator.onLine !== false
      );
    }

    function refresh() {
      if (!canRefresh()) return false;
      lastRefreshAtRef.current = Date.now();
      startTransition(() => router.refresh());
      return true;
    }

    function markInactive() {
      inactiveSinceRef.current ??= Date.now();
    }

    function refreshAfterReturn() {
      const inactiveSince = inactiveSinceRef.current;
      if (inactiveSince === null) return;
      if (Date.now() - inactiveSince < READER_RETURN_MINIMUM_MS) {
        inactiveSinceRef.current = null;
        return;
      }
      if (refresh()) inactiveSinceRef.current = null;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") markInactive();
      else refreshAfterReturn();
    }

    function onOnline() {
      if (inactiveSinceRef.current !== null) {
        refreshAfterReturn();
      } else if (
        Date.now() - lastRefreshAtRef.current >=
        READER_FRESHNESS_INTERVAL_MS
      ) {
        refresh();
      }
    }

    const interval = window.setInterval(() => {
      if (
        Date.now() - lastRefreshAtRef.current >=
        READER_FRESHNESS_INTERVAL_MS
      ) {
        refresh();
      }
    }, READER_FRESHNESS_INTERVAL_MS);

    window.addEventListener("blur", markInactive);
    window.addEventListener("focus", refreshAfterReturn);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("blur", markInactive);
      window.removeEventListener("focus", refreshAfterReturn);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
