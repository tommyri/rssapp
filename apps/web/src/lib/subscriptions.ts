import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { feeds, folders, subscriptions } from "@/db/schema";
import {
  buildSubscriptionSettings,
  type SortOrder,
  type SubscriptionSettings,
} from "@/lib/subscription-settings";

/**
 * Return the id of the user's folder with this name, creating it if needed.
 * Pass a cache to dedupe lookups across a batch (e.g. OPML import).
 */
export async function ensureFolder(
  userId: number,
  name: string,
  cache?: Map<string, number>,
): Promise<number> {
  const cached = cache?.get(name);
  if (cached) return cached;

  const [inserted] = await db
    .insert(folders)
    .values({ userId, name })
    .onConflictDoNothing({ target: [folders.userId, folders.name] })
    .returning({ id: folders.id });

  let id = inserted?.id;
  if (id === undefined) {
    const [existing] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.userId, userId), eq(folders.name, name)));
    id = existing.id;
  }

  cache?.set(name, id);
  return id;
}

/** Update a subscription's custom title, folder (created if new), and settings. */
export async function updateSubscription(
  userId: number,
  feedId: number,
  opts: {
    customTitle: string | null;
    folderName: string | null;
    autoReadDays: number | null;
    sortOrder: SortOrder;
    defaultUnreadOnly: boolean;
  },
): Promise<void> {
  const folderId = opts.folderName
    ? await ensureFolder(userId, opts.folderName)
    : null;

  const [row] = await db
    .select({ settings: subscriptions.settings })
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feedId)),
    );

  const settings = buildSubscriptionSettings(
    (row?.settings ?? {}) as SubscriptionSettings,
    opts,
  );

  await db
    .update(subscriptions)
    .set({
      customTitle: opts.customTitle,
      folderId,
      settings,
    })
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feedId)),
    );
}

/**
 * Pause or resume fetching a feed for this user (feed health). Targeted write:
 * merges onto the existing settings so it never races the Save form's fields,
 * and stores the key only while paused. Resuming marks the feed due so the
 * scheduler picks it up on the next tick instead of waiting out its interval.
 */
export async function setSubscriptionPaused(
  userId: number,
  feedId: number,
  paused: boolean,
): Promise<void> {
  const [row] = await db
    .select({ settings: subscriptions.settings })
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feedId)),
    );
  if (!row) return;

  const settings: SubscriptionSettings = { ...row.settings };
  if (paused) settings.paused = true;
  else delete settings.paused;

  await db
    .update(subscriptions)
    .set({ settings })
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feedId)),
    );

  if (!paused) {
    await db
      .update(feeds)
      .set({ nextFetchAt: new Date() })
      .where(eq(feeds.id, feedId));
  }
}

/**
 * Unsubscribe the user from a feed. If no one is subscribed anymore, delete the
 * global feed too (cascading its items/state/logs) so we stop polling it.
 */
export async function unsubscribe(
  userId: number,
  feedId: number,
): Promise<void> {
  await db
    .delete(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feedId)),
    );

  const [{ value: remaining }] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(eq(subscriptions.feedId, feedId));

  if (remaining === 0) {
    await db.delete(feeds).where(eq(feeds.id, feedId));
  }
}
