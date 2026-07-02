"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { getCurrentUserId } from "@/lib/current-user";
import {
  addFeedForUser,
  getOrExtractFullContent,
  refreshAllForSubscriber,
} from "@/lib/feeds";
import { importOpmlForUser } from "@/lib/opml";
import {
  type ItemsPage,
  listItems,
  markAllRead,
  setItemRead,
  setItemStarred,
  setItemsRead,
} from "@/lib/reader";

const viewSchema = z.object({
  feedId: z.number().int().positive().optional(),
  folderId: z.number().int().positive().optional(),
  starred: z.boolean().optional(),
  unreadOnly: z.boolean().optional(),
});

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
  await signOut({ redirectTo: "/login" });
}

// --- Reading-loop actions, called directly from the client article list.
// They don't revalidate: the client updates optimistically and uses
// router.refresh() to sync the sidebar counts.

export async function loadFullContentAction(
  itemId: number,
): Promise<{ ok: boolean; html?: string; error?: string }> {
  if (!Number.isInteger(itemId))
    return { ok: false, error: "Invalid article." };
  const userId = await getCurrentUserId();
  const result = await getOrExtractFullContent(userId, itemId);
  return result.ok
    ? { ok: true, html: result.html }
    : { ok: false, error: result.error };
}

export async function setItemReadAction(
  itemId: number,
  read: boolean,
): Promise<void> {
  if (!Number.isInteger(itemId)) return;
  const userId = await getCurrentUserId();
  await setItemRead(userId, itemId, read === true);
}

export async function setItemsReadAction(itemIds: number[]): Promise<void> {
  const ids = z.array(z.number().int().positive()).max(1000).parse(itemIds);
  if (ids.length === 0) return;
  const userId = await getCurrentUserId();
  await setItemsRead(userId, ids);
}

export async function setItemStarredAction(
  itemId: number,
  starred: boolean,
): Promise<void> {
  if (!Number.isInteger(itemId)) return;
  const userId = await getCurrentUserId();
  await setItemStarred(userId, itemId, starred === true);
}

export async function markAllReadAction(
  view: ClientView,
  olderThanDays: number | null,
): Promise<{ marked: number }> {
  const parsedView = viewSchema.parse(view);
  const days =
    olderThanDays === null
      ? null
      : z.number().int().min(1).max(365).parse(olderThanDays);
  const cutoff = days ? new Date(Date.now() - days * 86_400_000) : undefined;
  const userId = await getCurrentUserId();
  const marked = await markAllRead(userId, parsedView, cutoff);
  return { marked };
}

export async function fetchItemsAction(
  view: ClientView,
  cursor: { ts: string; id: number },
): Promise<ItemsPage> {
  const parsedView = viewSchema.parse(view);
  const parsedCursor = z
    .object({ ts: z.coerce.date(), id: z.number().int().positive() })
    .parse(cursor);
  const userId = await getCurrentUserId();
  return listItems(userId, { ...parsedView, cursor: parsedCursor });
}
