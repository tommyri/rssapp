import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { feeds, folders, subscriptions } from "@/db/schema";

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
    fullContent: boolean;
    autoReadDays: number | null;
  },
): Promise<void> {
  const folderId = opts.folderName
    ? await ensureFolder(userId, opts.folderName)
    : null;
  await db
    .update(subscriptions)
    .set({
      customTitle: opts.customTitle,
      folderId,
      settings: {
        fullContent: opts.fullContent,
        ...(opts.autoReadDays ? { autoReadDays: opts.autoReadDays } : {}),
      },
    })
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feedId)),
    );
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
