"use client";

import { useEffect, useRef } from "react";
import {
  parseSavedPageExtractionSnapshot,
  SAVED_PAGE_POLL_DELAYS_MS,
  SAVED_PAGE_POLL_MAX_DURATION_MS,
  type SavedPageExtractionSnapshot,
} from "@/lib/saved-page-extraction";

interface Props {
  pageId: number;
  onResolved: (snapshot: SavedPageExtractionSnapshot) => void;
  /**
   * Whether this watch has given up with the page still pending: false while a
   * fresh watch is live, true once its budget runs out.
   */
  onExhaustedChange: (exhausted: boolean) => void;
}

/**
 * Poll only while one pending saved page is open. The durable extraction job
 * remains server-owned; this watcher merely replaces its loading state as soon
 * as the stored result becomes terminal. Watching is bounded, and giving up is
 * reported so the reader is never left waiting on a watcher that has stopped.
 */
export function SavedPageExtractionWatcher({
  pageId,
  onResolved,
  onExhaustedChange,
}: Props) {
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  const onExhaustedChangeRef = useRef(onExhaustedChange);
  onExhaustedChangeRef.current = onExhaustedChange;

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timeout: number | null = null;
    let controller: AbortController | null = null;
    const startedAt = Date.now();

    function canPoll() {
      return (
        document.visibilityState === "visible" &&
        window.navigator.onLine !== false
      );
    }

    function clearScheduledPoll() {
      if (timeout === null) return;
      window.clearTimeout(timeout);
      timeout = null;
    }

    /** Stop watching and tell the reader, so the loading state can say so. */
    function giveUp() {
      if (stopped) return;
      stopped = true;
      onExhaustedChangeRef.current(true);
    }

    function schedule(delay: number) {
      if (stopped || timeout !== null) return;
      if (Date.now() - startedAt >= SAVED_PAGE_POLL_MAX_DURATION_MS) {
        giveUp();
        return;
      }
      timeout = window.setTimeout(() => {
        timeout = null;
        void poll();
      }, delay);
    }

    function scheduleNextPoll() {
      const delay =
        SAVED_PAGE_POLL_DELAYS_MS[
          Math.min(attempt, SAVED_PAGE_POLL_DELAYS_MS.length - 1)
        ];
      attempt += 1;
      schedule(delay ?? 10_000);
    }

    async function poll() {
      if (stopped || controller !== null) return;
      if (!canPoll()) return;

      controller = new AbortController();
      try {
        const response = await fetch(`/api/saved-pages/${pageId}/extraction`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 404) {
          stopped = true;
          return;
        }
        if (!response.ok) {
          scheduleNextPoll();
          return;
        }

        const snapshot = parseSavedPageExtractionSnapshot(
          await response.json(),
        );
        if (!snapshot || snapshot.id !== pageId) {
          stopped = true;
          return;
        }
        if (snapshot.status === "pending") {
          scheduleNextPoll();
          return;
        }

        stopped = true;
        onResolvedRef.current(snapshot);
      } catch (error) {
        if (
          !stopped &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          scheduleNextPoll();
        }
      } finally {
        controller = null;
      }
    }

    function resume() {
      if (!canPoll() || controller !== null) return;
      clearScheduledPoll();
      schedule(0);
    }

    // This watch is live, so any give-up reported by a previous one — including
    // the watch for a page that was just closed and reopened — is stale.
    onExhaustedChangeRef.current(false);
    scheduleNextPoll();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      clearScheduledPoll();
      controller?.abort();
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [pageId]);

  return null;
}
