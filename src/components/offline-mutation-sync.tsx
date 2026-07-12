"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";
import {
  setItemReadAction,
  setItemReadLaterAction,
  setItemStarredAction,
  setSavedPageReadAction,
} from "@/app/actions";
import {
  listOfflineMutations,
  OFFLINE_MUTATIONS_QUEUED_EVENT,
  type OfflineMutation,
  removeOfflineMutationIfUnchanged,
} from "@/lib/offline-library";

async function applyOfflineMutation(mutation: OfflineMutation): Promise<void> {
  if (mutation.kind === "page") {
    if (mutation.field !== "read") {
      throw new Error("Saved-page mutation is not supported.");
    }
    await setSavedPageReadAction(mutation.itemId, mutation.value);
    return;
  }

  switch (mutation.field) {
    case "read":
      await setItemReadAction(mutation.itemId, mutation.value);
      return;
    case "starred":
      await setItemStarredAction(mutation.itemId, mutation.value);
      return;
    case "readLater":
      await setItemReadLaterAction(mutation.itemId, mutation.value);
  }
}

/** Replays locally queued reader changes whenever this authenticated device is online. */
export function OfflineMutationSync({ userId }: { userId: number }) {
  const router = useRouter();
  const syncing = useRef(false);
  const [, startSync] = useTransition();

  const sync = useCallback(async (): Promise<number> => {
    if (syncing.current) return 0;
    syncing.current = true;
    let applied = 0;
    try {
      for (const mutation of await listOfflineMutations(userId)) {
        try {
          await applyOfflineMutation(mutation);
          await removeOfflineMutationIfUnchanged(mutation);
          applied += 1;
        } catch {
          // Keep this and later changes for the next online attempt.
          break;
        }
      }
      return applied;
    } finally {
      syncing.current = false;
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const trigger = () => {
      if (cancelled || !navigator.onLine) return;
      startSync(async () => {
        const applied = await sync();
        if (applied > 0 && !cancelled) router.refresh();
      });
    };

    trigger();
    window.addEventListener("online", trigger);
    window.addEventListener(OFFLINE_MUTATIONS_QUEUED_EVENT, trigger);
    return () => {
      cancelled = true;
      window.removeEventListener("online", trigger);
      window.removeEventListener(OFFLINE_MUTATIONS_QUEUED_EVENT, trigger);
    };
  }, [router, sync]);

  return null;
}
