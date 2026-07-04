import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  feeds,
  folders,
  itemStates,
  items as itemsTable,
  subscriptions,
  users,
} from "@/db/schema";
import type { ExportEntry } from "@/lib/opml";

export interface FeedSummary {
  feedId: number;
  title: string | null;
  url: string;
  siteUrl: string | null;
  unread: number;
  lastError: string | null;
  folderId: number | null;
  folderName: string | null;
}

/** The user's subscribed feeds with per-feed unread counts, for the sidebar. */
export async function listFeeds(userId: number): Promise<FeedSummary[]> {
  return db
    .select({
      feedId: feeds.id,
      title: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      url: feeds.url,
      siteUrl: feeds.siteUrl,
      lastError: feeds.lastError,
      folderId: folders.id,
      folderName: folders.name,
      unread: sql<number>`cast(count(${itemsTable.id}) filter (where ${itemStates.read} is not true and ${itemStates.muted} is not true) as int)`,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
    .leftJoin(folders, eq(folders.id, subscriptions.folderId))
    .leftJoin(itemsTable, eq(itemsTable.feedId, feeds.id))
    .leftJoin(
      itemStates,
      and(eq(itemStates.itemId, itemsTable.id), eq(itemStates.userId, userId)),
    )
    .where(eq(subscriptions.userId, userId))
    .groupBy(
      feeds.id,
      subscriptions.customTitle,
      feeds.title,
      feeds.url,
      feeds.lastError,
      folders.id,
      folders.name,
    )
    .orderBy(sql`coalesce(${subscriptions.customTitle}, ${feeds.title})`);
}

export interface ManagedFeed {
  feedId: number;
  url: string;
  title: string | null;
  customTitle: string | null;
  feedTitle: string | null;
  folderName: string | null;
  fullContent: boolean;
  autoReadDays: number | null;
  unread: number;
  itemCount: number;
  lastFetchedAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
}

/** All subscriptions with health + counts, for the manage-feeds page. */
export async function listManagedFeeds(userId: number): Promise<ManagedFeed[]> {
  return db
    .select({
      feedId: feeds.id,
      url: feeds.url,
      title: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      customTitle: subscriptions.customTitle,
      feedTitle: feeds.title,
      folderName: folders.name,
      fullContent: sql<boolean>`coalesce(${subscriptions.settings}->>'fullContent', 'false') = 'true'`,
      autoReadDays: sql<
        number | null
      >`(${subscriptions.settings}->>'autoReadDays')::int`,
      unread: sql<number>`cast(count(${itemsTable.id}) filter (where ${itemStates.read} is not true and ${itemStates.muted} is not true) as int)`,
      itemCount: sql<number>`cast(count(${itemsTable.id}) as int)`,
      lastFetchedAt: feeds.lastFetchedAt,
      lastError: feeds.lastError,
      consecutiveFailures: feeds.consecutiveFailures,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
    .leftJoin(folders, eq(folders.id, subscriptions.folderId))
    .leftJoin(itemsTable, eq(itemsTable.feedId, feeds.id))
    .leftJoin(
      itemStates,
      and(eq(itemStates.itemId, itemsTable.id), eq(itemStates.userId, userId)),
    )
    .where(eq(subscriptions.userId, userId))
    .groupBy(
      feeds.id,
      subscriptions.customTitle,
      subscriptions.settings,
      folders.name,
    )
    .orderBy(
      sql`${folders.name} asc nulls last`,
      sql`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
    );
}

/** The user's folder names, for suggestions when assigning a feed to a folder. */
export async function listFolders(userId: number): Promise<string[]> {
  const rows = await db
    .select({ name: folders.name })
    .from(folders)
    .where(eq(folders.userId, userId))
    .orderBy(asc(folders.name));
  return rows.map((r) => r.name);
}

export interface ReaderItem {
  id: number;
  title: string | null;
  url: string | null;
  author: string | null;
  contentHtml: string | null;
  fullContentHtml: string | null;
  publishedAt: Date | null;
  /** Stable sort key (published_at falling back to created_at); cursor basis. */
  sortTs: Date;
  feedId: number;
  feedTitle: string | null;
  read: boolean;
  starred: boolean;
}

/** Which articles to show — a feed, a folder, starred, or everything. */
export interface ReaderView {
  feedId?: number;
  folderId?: number;
  starred?: boolean;
  unreadOnly?: boolean;
}

export interface ItemCursor {
  ts: Date;
  id: number;
}

export interface ListItemsOptions extends ReaderView {
  cursor?: ItemCursor;
  limit?: number;
}

export interface ItemsPage {
  items: ReaderItem[];
  hasMore: boolean;
}

const sortKey = sql`coalesce(${itemsTable.publishedAt}, ${itemsTable.createdAt})`;

function viewConditions(userId: number, view: ReaderView) {
  const conditions = [
    eq(subscriptions.userId, userId),
    sql`${itemStates.muted} is not true`,
  ];
  if (view.feedId) conditions.push(eq(itemsTable.feedId, view.feedId));
  if (view.folderId) conditions.push(eq(subscriptions.folderId, view.folderId));
  if (view.starred) conditions.push(eq(itemStates.starred, true));
  if (view.unreadOnly) conditions.push(sql`${itemStates.read} is not true`);
  return conditions;
}

/** One page of articles for a view, newest first, keyset-paginated. */
export async function listItems(
  userId: number,
  opts: ListItemsOptions = {},
): Promise<ItemsPage> {
  const { cursor, limit = 50, ...view } = opts;
  const conditions = viewConditions(userId, view);
  if (cursor) {
    conditions.push(
      sql`(${sortKey}, ${itemsTable.id}) < (${cursor.ts}, ${cursor.id})`,
    );
  }

  const rows = await db
    .select({
      id: itemsTable.id,
      title: itemsTable.title,
      url: itemsTable.url,
      author: itemsTable.author,
      contentHtml: itemsTable.contentHtml,
      fullContentHtml: itemsTable.fullContentHtml,
      publishedAt: itemsTable.publishedAt,
      sortTs: sql<Date>`${sortKey}`.mapWith((v) => new Date(v)),
      feedId: feeds.id,
      feedTitle: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      read: sql<boolean>`coalesce(${itemStates.read}, false)`,
      starred: sql<boolean>`coalesce(${itemStates.starred}, false)`,
    })
    .from(itemsTable)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, itemsTable.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .innerJoin(feeds, eq(feeds.id, itemsTable.feedId))
    .leftJoin(
      itemStates,
      and(eq(itemStates.itemId, itemsTable.id), eq(itemStates.userId, userId)),
    )
    .where(and(...conditions))
    .orderBy(sql`${sortKey} desc`, desc(itemsTable.id))
    .limit(limit + 1); // one extra row to detect whether more exist

  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

const SEARCH_LIMIT = 50;

/**
 * Full-text search across the user's subscribed items — title, author, and
 * body (extracted content when present). websearch syntax: quoted phrases,
 * OR, -exclusions. Includes read items (search is an archive operation);
 * excludes muted ones. Top results by rank, recency as tiebreak.
 */
export async function searchItems(
  userId: number,
  query: string,
): Promise<ReaderItem[]> {
  // The index holds english + norwegian stems (schema.ts); parse the query
  // with both and OR them so either language's inflections match.
  const tsquery = sql`(websearch_to_tsquery('english', ${query}) || websearch_to_tsquery('norwegian', ${query}))`;

  return db
    .select({
      id: itemsTable.id,
      title: itemsTable.title,
      url: itemsTable.url,
      author: itemsTable.author,
      contentHtml: itemsTable.contentHtml,
      fullContentHtml: itemsTable.fullContentHtml,
      publishedAt: itemsTable.publishedAt,
      sortTs: sql<Date>`${sortKey}`.mapWith((v) => new Date(v)),
      feedId: feeds.id,
      feedTitle: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      read: sql<boolean>`coalesce(${itemStates.read}, false)`,
      starred: sql<boolean>`coalesce(${itemStates.starred}, false)`,
    })
    .from(itemsTable)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, itemsTable.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .innerJoin(feeds, eq(feeds.id, itemsTable.feedId))
    .leftJoin(
      itemStates,
      and(eq(itemStates.itemId, itemsTable.id), eq(itemStates.userId, userId)),
    )
    .where(
      and(
        sql`${itemStates.muted} is not true`,
        sql`${itemsTable.searchVector} @@ ${tsquery}`,
      ),
    )
    .orderBy(
      sql`ts_rank(${itemsTable.searchVector}, ${tsquery}) desc`,
      sql`${sortKey} desc`,
    )
    .limit(SEARCH_LIMIT);
}

/** Ids of the user's unread items in a view, optionally only older than a cutoff. */
async function unreadItemIds(
  userId: number,
  view: ReaderView,
  olderThan?: Date,
): Promise<number[]> {
  const conditions = viewConditions(userId, { ...view, unreadOnly: true });
  if (olderThan) conditions.push(sql`${sortKey} < ${olderThan}`);

  const rows = await db
    .select({ id: itemsTable.id })
    .from(itemsTable)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, itemsTable.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .leftJoin(
      itemStates,
      and(eq(itemStates.itemId, itemsTable.id), eq(itemStates.userId, userId)),
    )
    .where(and(...conditions));
  return rows.map((r) => r.id);
}

const READ_CHUNK = 500;

/** Mark a batch of items read for one user (scroll-marking, mark-all-read). */
export async function setItemsRead(
  userId: number,
  itemIds: number[],
): Promise<void> {
  const readAt = new Date();
  for (let i = 0; i < itemIds.length; i += READ_CHUNK) {
    const chunk = itemIds.slice(i, i + READ_CHUNK);
    await db
      .insert(itemStates)
      .values(chunk.map((itemId) => ({ userId, itemId, read: true, readAt })))
      .onConflictDoUpdate({
        target: [itemStates.userId, itemStates.itemId],
        set: {
          read: true,
          readAt: sql`coalesce(${itemStates.readAt}, excluded.read_at)`,
        },
      });
  }
}

/** Mark everything unread in a view as read; optionally only items older than a cutoff. */
export async function markAllRead(
  userId: number,
  view: ReaderView,
  olderThan?: Date,
): Promise<number> {
  const ids = await unreadItemIds(userId, view, olderThan);
  await setItemsRead(userId, ids);
  return ids.length;
}

/**
 * The auto-mark-read overload valve (docs/features.md v1): for every
 * subscription whose effective autoReadDays is set (per-feed override, else
 * the user default), mark unread items older than the cutoff as read. Called
 * by the scheduler each tick; idempotent. Returns how many items were marked.
 */
export async function sweepAutoRead(): Promise<number> {
  const effectiveDays = sql<
    number | null
  >`coalesce((${subscriptions.settings}->>'autoReadDays')::int, (${users.settings}->>'autoReadDays')::int)`;

  const targets = await db
    .select({
      userId: subscriptions.userId,
      feedId: subscriptions.feedId,
      days: effectiveDays,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(sql`${effectiveDays} >= 1`);

  let marked = 0;
  for (const t of targets) {
    if (t.days === null) continue;
    const cutoff = new Date(Date.now() - t.days * 86_400_000);
    const ids = await unreadItemIds(t.userId, { feedId: t.feedId }, cutoff);
    if (ids.length > 0) {
      await setItemsRead(t.userId, ids);
      marked += ids.length;
    }
  }
  return marked;
}

/** Set starred state for one item for one user. */
export async function setItemStarred(
  userId: number,
  itemId: number,
  starred: boolean,
): Promise<void> {
  const starredAt = starred ? new Date() : null;
  await db
    .insert(itemStates)
    .values({ userId, itemId, starred, starredAt })
    .onConflictDoUpdate({
      target: [itemStates.userId, itemStates.itemId],
      set: { starred, starredAt },
    });
}

/** All of the user's subscriptions in OPML-export shape, grouped-ready by folder. */
export async function subscriptionsForExport(
  userId: number,
): Promise<ExportEntry[]> {
  return db
    .select({
      xmlUrl: feeds.url,
      title: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      htmlUrl: feeds.siteUrl,
      folderName: folders.name,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
    .leftJoin(folders, eq(folders.id, subscriptions.folderId))
    .where(eq(subscriptions.userId, userId))
    .orderBy(asc(folders.name), asc(feeds.title));
}

/** Set read state for one item for one user (item_states is per-user, so no cross-user leak). */
export async function setItemRead(
  userId: number,
  itemId: number,
  read: boolean,
): Promise<void> {
  const readAt = read ? new Date() : null;
  await db
    .insert(itemStates)
    .values({ userId, itemId, read, readAt })
    .onConflictDoUpdate({
      target: [itemStates.userId, itemStates.itemId],
      set: { read, readAt },
    });
}
