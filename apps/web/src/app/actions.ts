"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { revokeAuthSessionById } from "@/lib/auth-sessions";
import { getCurrentSessionId, getCurrentUserId } from "@/lib/current-user";
import { addFeedForUser, refreshAllForSubscriber } from "@/lib/feeds";
import { retryFullContentForUser } from "@/lib/feeds/full-content";
import {
  OFFLINE_READ_LATER_DOWNLOAD_LIMIT,
  type OfflineArticle,
  type OfflineArticleSource,
  offlineArticlesFromReaderItems,
} from "@/lib/offline-library";
import { importOpmlForUser } from "@/lib/opml";
import {
  type ItemsPage,
  listItems,
  listReadLater,
  markAllRead,
  setItemRead,
  setItemReadingProgress,
  setItemReadLater,
  setItemStarred,
} from "@/lib/reader";
import {
  extractSavedPage,
  removeSavedPage,
  retrySavedPage,
  saveLink,
  setSavedPageRead,
  setSavedPageReadingProgress,
} from "@/lib/saved-pages";

const viewSchema = z.object({
  feedId: z.number().int().positive().optional(),
  folderId: z.number().int().positive().optional(),
  starred: z.boolean().optional(),
  readLater: z.boolean().optional(),
  labelId: z.number().int().positive().optional(),
  unreadOnly: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  sortOrder: z.enum(["newest", "oldest"]).optional(),
  highlight: z.boolean().optional(),
});

const offlineReadLaterDownloadLimitSchema = z.union([
  z.literal(25),
  z.literal(50),
  z.literal(100),
]);
const offlineArticleSourceSchema = z.enum(["manual", "automatic"]);

export type ClientView = z.infer<typeof viewSchema>;

export interface ActionState {
  ok: boolean;
  message: string;
}

export async function addFeedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { ok: false, message: "Enter a feed or site URL." };

  try {
    const userId = await getCurrentUserId();
    const result = await addFeedForUser(userId, url);
    revalidatePath("/");
    const n = result.itemsAdded;
    return {
      ok: true,
      message: `Added “${result.title}” — ${n} article${n === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to add feed.",
    };
  }
}

export async function refreshAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  return refreshFeedsAction();
}

/** Shared by the toolbar and touch pull-to-refresh gesture. */
export async function refreshFeedsAction(): Promise<ActionState> {
  try {
    const userId = await getCurrentUserId();
    const { feeds, itemsAdded } = await refreshAllForSubscriber(userId);
    revalidatePath("/");
    return {
      ok: true,
      message: `Refreshed ${feeds} feed${feeds === 1 ? "" : "s"} — ${itemsAdded} new.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Refresh failed.",
    };
  }
}

export async function importOpmlAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose an OPML file to import." };
  }

  try {
    const xml = await file.text();
    const userId = await getCurrentUserId();
    const summary = await importOpmlForUser(userId, xml);
    revalidatePath("/");
    if (summary.total === 0) {
      return { ok: false, message: "No feeds found in that OPML file." };
    }
    const skipped =
      summary.alreadySubscribed > 0
        ? ` (${summary.alreadySubscribed} already subscribed)`
        : "";
    return {
      ok: true,
      message: `Imported ${summary.added} feed${summary.added === 1 ? "" : "s"}${skipped}. Fetching in the background…`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Import failed.",
    };
  }
}

export async function signOutAction(): Promise<void> {
  const sessionId = await getCurrentSessionId();
  if (sessionId) await revokeAuthSessionById(sessionId);
  await signOut({ redirectTo: "/login" });
}

// --- Save any link to read later (docs/features.md v0.2).

export async function saveLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { ok: false, message: "Paste a link to save." };

  const userId = await getCurrentUserId();
  const result = await saveLink(userId, url);
  if (!result.ok) return { ok: false, message: result.error };

  if (result.alreadySaved) {
    return { ok: true, message: "Already in your Read later." };
  }
  // Fetch the readable copy now so it's ready when the view refreshes; the
  // scheduler sweep is the backstop if this fails or times out.
  try {
    await extractSavedPage(result.id);
  } catch {
    // Left pending — sweepPendingSavedPages will retry it.
  }
  revalidatePath("/");
  return { ok: true, message: "Saved to Read later." };
}

export async function setSavedPageReadAction(
  id: number,
  read: boolean,
): Promise<void> {
  if (!Number.isInteger(id)) return;
  const userId = await getCurrentUserId();
  await setSavedPageRead(userId, id, read === true);
}

export async function setSavedPageReadingProgressAction(
  id: number,
  progress: number | null,
): Promise<void> {
  if (!Number.isInteger(id)) return;
  const parsed = z
    .number()
    .finite()
    .min(0)
    .max(1)
    .nullable()
    .safeParse(progress);
  if (!parsed.success) return;
  const userId = await getCurrentUserId();
  await setSavedPageReadingProgress(userId, id, parsed.data);
}

export async function removeSavedPageAction(id: number): Promise<void> {
  if (!Number.isInteger(id)) return;
  const userId = await getCurrentUserId();
  await removeSavedPage(userId, id);
}

export async function retrySavedPageAction(
  id: number,
): Promise<{ ok: boolean; html?: string; error?: string }> {
  if (!Number.isInteger(id)) return { ok: false, error: "Invalid page." };
  const userId = await getCurrentUserId();
  const result = await retrySavedPage(userId, id);
  if (!result.ok) return { ok: false, error: result.error };
  return result.page.status === "ready"
    ? { ok: true, html: result.page.contentHtml ?? "" }
    : { ok: false, error: result.page.error ?? "Extraction failed." };
}

// --- Reading-loop actions, called directly from the client article list.
// They don't revalidate: the client updates optimistically and uses
// router.refresh() to sync the sidebar counts.

export async function retryFullContentAction(
  itemId: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(itemId))
    return { ok: false, error: "Invalid article." };
  const userId = await getCurrentUserId();
  return retryFullContentForUser(userId, itemId);
}

export async function setItemReadAction(
  itemId: number,
  read: boolean,
  collapse = false,
): Promise<void> {
  if (!Number.isInteger(itemId)) return;
  const userId = await getCurrentUserId();
  // When duplicates are collapsed, reading the shown copy clears its siblings too.
  await setItemRead(userId, itemId, read === true, {
    fanOut: collapse === true,
  });
}

export async function setItemReadingProgressAction(
  itemId: number,
  progress: number | null,
): Promise<void> {
  if (!Number.isInteger(itemId)) return;
  const parsed = z
    .number()
    .finite()
    .min(0)
    .max(1)
    .nullable()
    .safeParse(progress);
  if (!parsed.success) return;
  const userId = await getCurrentUserId();
  await setItemReadingProgress(userId, itemId, parsed.data);
}

export async function setItemStarredAction(
  itemId: number,
  starred: boolean,
): Promise<void> {
  if (!Number.isInteger(itemId)) return;
  const userId = await getCurrentUserId();
  await setItemStarred(userId, itemId, starred === true);
}

export async function setItemReadLaterAction(
  itemId: number,
  readLater: boolean,
): Promise<void> {
  if (!Number.isInteger(itemId)) return;
  const userId = await getCurrentUserId();
  await setItemReadLater(userId, itemId, readLater === true);
}

export async function markAllReadAction(
  view: ClientView,
  olderThanDays: number | null,
  olderThanIso?: string | null,
): Promise<{ marked: number }> {
  const parsedView = viewSchema.parse(view);
  let cutoff: Date | undefined;
  if (olderThanIso) {
    cutoff = z.coerce.date().parse(olderThanIso);
  } else if (olderThanDays !== null) {
    cutoff = new Date(
      Date.now() -
        z.number().int().min(1).max(365).parse(olderThanDays) * 86_400_000,
    );
  }
  const userId = await getCurrentUserId();
  const marked = await markAllRead(userId, parsedView, cutoff);
  return { marked };
}

export async function fetchItemsAction(
  view: ClientView,
  cursor: { ts: string; id: number } | null,
  collapse = false,
): Promise<ItemsPage> {
  const parsedView = viewSchema.parse(view);
  if (parsedView.readOnly && !parsedView.feedId) {
    throw new Error("Read history is available for individual feeds only.");
  }
  const parsedCursor = cursor
    ? z
        .object({ ts: z.coerce.date(), id: z.number().int().positive() })
        .parse(cursor)
    : undefined;
  const userId = await getCurrentUserId();
  return listItems(userId, {
    ...parsedView,
    cursor: parsedCursor,
    collapse: collapse === true,
  });
}

/**
 * Returns a compact, user-scoped copy of the newest Read later entries for
 * browser storage. This intentionally excludes images, embeds, and mutable
 * reader state so an offline download remains bounded and safe to persist.
 */
export async function downloadReadLaterForOfflineAction(
  limit = OFFLINE_READ_LATER_DOWNLOAD_LIMIT,
  source: OfflineArticleSource = "manual",
): Promise<OfflineArticle[]> {
  const parsedLimit = offlineReadLaterDownloadLimitSchema.parse(limit);
  const parsedSource = offlineArticleSourceSchema.parse(source);
  const userId = await getCurrentUserId();
  const { items } = await listReadLater(userId);
  return offlineArticlesFromReaderItems(
    userId,
    items,
    parsedLimit,
    parsedSource,
  );
}
