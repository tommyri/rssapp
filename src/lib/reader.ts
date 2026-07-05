import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { db } from "@/db";
import {
  feeds,
  folders,
  itemStates,
  items as itemsTable,
  subscriptions,
  users,
} from "@/db/schema";
import { otherFeedTitles } from "@/lib/duplicates";
import type { ExportEntry } from "@/lib/opml";
import { DEFAULT_AUTO_READ_DAYS } from "@/lib/reading-prefs";
import {
  listSavedPages,
  type SavedPage,
  savedPagesCount,
  searchSavedPages,
} from "@/lib/saved-pages";
import type { SortOrder } from "@/lib/subscription-settings";

export interface FeedSummary {
  feedId: number;
  title: string | null;
  url: string;
  siteUrl: string | null;
  unread: number;
  lastError: string | null;
  folderId: number | null;
  folderName: string | null;
  /* Raw values for the per-feed edit menu: */
  customTitle: string | null;
  feedTitle: string | null;
  fullContent: boolean;
  autoReadDays: number | null;
  sortOrder: SortOrder;
  defaultUnreadOnly: boolean;
}

/**
 * The user's subscribed feeds with per-feed unread counts, for the sidebar.
 * React.cache: the reader page (sidebar) and the root layout (command palette)
 * both call this in the same request — memoized so it queries once.
 */
export const listFeeds = cache(
  async (userId: number): Promise<FeedSummary[]> => {
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
        customTitle: subscriptions.customTitle,
        feedTitle: feeds.title,
        fullContent: sql<boolean>`coalesce(${subscriptions.settings}->>'fullContent', 'false') = 'true'`,
        autoReadDays: sql<
          number | null
        >`(${subscriptions.settings}->>'autoReadDays')::int`,
        sortOrder: sql<SortOrder>`case when ${subscriptions.settings}->>'sortOrder' = 'oldest' then 'oldest' else 'newest' end`,
        defaultUnreadOnly: sql<boolean>`coalesce((${subscriptions.settings}->>'defaultUnreadOnly')::boolean, true)`,
        unread: sql<number>`cast(count(${itemsTable.id}) filter (where ${itemStates.read} is not true and ${itemStates.muted} is not true) as int)`,
      })
      .from(subscriptions)
      .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
      .leftJoin(folders, eq(folders.id, subscriptions.folderId))
      .leftJoin(itemsTable, eq(itemsTable.feedId, feeds.id))
      .leftJoin(
        itemStates,
        and(
          eq(itemStates.itemId, itemsTable.id),
          eq(itemStates.userId, userId),
        ),
      )
      .where(eq(subscriptions.userId, userId))
      .groupBy(
        feeds.id,
        subscriptions.customTitle,
        subscriptions.settings,
        feeds.title,
        feeds.url,
        feeds.lastError,
        folders.id,
        folders.name,
      )
      .orderBy(sql`coalesce(${subscriptions.customTitle}, ${feeds.title})`);
  },
);

export interface ManagedFeed {
  feedId: number;
  url: string;
  title: string | null;
  customTitle: string | null;
  feedTitle: string | null;
  folderName: string | null;
  fullContent: boolean;
  autoReadDays: number | null;
  sortOrder: SortOrder;
  defaultUnreadOnly: boolean;
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
      sortOrder: sql<SortOrder>`case when ${subscriptions.settings}->>'sortOrder' = 'oldest' then 'oldest' else 'newest' end`,
      defaultUnreadOnly: sql<boolean>`coalesce((${subscriptions.settings}->>'defaultUnreadOnly')::boolean, true)`,
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
  /**
   * Discriminates a feed article ("item") from a saved web page ("page") in the
   * unified Read later view. Ids are only unique within a kind, so anything that
   * keys off an entry must combine kind + id.
   */
  kind: "item" | "page";
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
  readLater: boolean;
  /**
   * Set only in collapsed multi-feed views (duplicate filtering): how many
   * copies of this story the user's feeds carry, and the titles of the *other*
   * feeds it also arrived in. read/starred/readLater above are the group's
   * combined state, so reading any copy clears the story.
   */
  dupCount?: number;
  dupFeedTitles?: string[];
  /** Saved-page extraction state (kind === "page" only). */
  pageStatus?: "pending" | "ready" | "error";
  /** Saved-page extraction error, when pageStatus === "error". */
  pageError?: string | null;
}

/** Which articles to show — a feed, a folder, starred, read-later, or everything. */
export interface ReaderView {
  feedId?: number;
  folderId?: number;
  starred?: boolean;
  readLater?: boolean;
  unreadOnly?: boolean;
  /** Oldest-first when viewing a single feed; ignored for folder/all views. */
  sortOrder?: SortOrder;
  /**
   * Collapse the same story arriving from multiple feeds into one row (the
   * user's setting). Applies only to multi-feed list views (All, folder) —
   * single-feed, Starred and Read later are never collapsed.
   */
  collapse?: boolean;
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
  if (view.readLater) conditions.push(eq(itemStates.readLater, true));
  if (view.unreadOnly) conditions.push(sql`${itemStates.read} is not true`);
  return conditions;
}

/** One page of articles for a view, keyset-paginated (newest-first unless feed is oldest-first). */
export async function listItems(
  userId: number,
  opts: ListItemsOptions = {},
): Promise<ItemsPage> {
  // Collapse duplicates only in multi-feed list views; single-feed, Starred and
  // Read later stay one-row-per-item (see listItemsCollapsed).
  if (
    opts.collapse &&
    opts.feedId === undefined &&
    !opts.starred &&
    !opts.readLater
  ) {
    return listItemsCollapsed(userId, opts);
  }

  const { cursor, limit = 50, ...view } = opts;
  const oldestFirst = view.feedId !== undefined && view.sortOrder === "oldest";
  const conditions = viewConditions(userId, view);
  if (cursor) {
    conditions.push(
      oldestFirst
        ? sql`(${sortKey}, ${itemsTable.id}) > (${cursor.ts}, ${cursor.id})`
        : sql`(${sortKey}, ${itemsTable.id}) < (${cursor.ts}, ${cursor.id})`,
    );
  }

  const rows = await db
    .select({
      kind: sql<"item">`'item'`,
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
      readLater: sql<boolean>`coalesce(${itemStates.readLater}, false)`,
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
    .orderBy(
      oldestFirst ? sql`${sortKey} asc` : sql`${sortKey} desc`,
      oldestFirst ? asc(itemsTable.id) : desc(itemsTable.id),
    )
    .limit(limit + 1); // one extra row to detect whether more exist

  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

// The grouping key for duplicate collapsing: items that share a canonical_url
// are the same story; anything without one is its own singleton group.
const collapseKey = sql`coalesce(${itemsTable.canonicalUrl}, 'i' || ${itemsTable.id})`;

/**
 * Like listItems, but collapses items sharing a canonical_url into a single
 * representative row (the earliest published — the original), so the same story
 * arriving from several feeds shows once. The window pass computes, per group:
 * the combined read/star/read-later state (so reading any copy clears the
 * story), the copy count, and the feeds it appeared in; the outer query keeps
 * the representative and keyset-paginates on its sort position. Runs over the
 * view's full candidate set each page, which is fine at a personal reader's
 * scale (the list isn't virtualized either).
 */
async function listItemsCollapsed(
  userId: number,
  opts: ListItemsOptions,
): Promise<ItemsPage> {
  const { cursor, limit = 50, ...view } = opts;
  const conditions = [
    eq(subscriptions.userId, userId),
    sql`${itemStates.muted} is not true`,
  ];
  if (view.folderId) conditions.push(eq(subscriptions.folderId, view.folderId));

  const feedTitle = sql<
    string | null
  >`coalesce(${subscriptions.customTitle}, ${feeds.title})`;

  const grouped = db
    .select({
      id: itemsTable.id,
      title: itemsTable.title,
      url: itemsTable.url,
      author: itemsTable.author,
      contentHtml: itemsTable.contentHtml,
      fullContentHtml: itemsTable.fullContentHtml,
      publishedAt: itemsTable.publishedAt,
      sortTs: sql`${sortKey}`.as("sort_ts"),
      // Source from items.feed_id (same value as feeds.id via the join) so this
      // subquery column is "feed_id" — selecting feeds.id would surface a second
      // bare "id" column, colliding with items.id and breaking the outer query.
      feedId: itemsTable.feedId,
      feedTitle: feedTitle.as("feed_title"),
      groupRead:
        sql<boolean>`bool_or(coalesce(${itemStates.read}, false)) over (partition by ${collapseKey})`.as(
          "group_read",
        ),
      groupStarred:
        sql<boolean>`bool_or(coalesce(${itemStates.starred}, false)) over (partition by ${collapseKey})`.as(
          "group_starred",
        ),
      groupReadLater:
        sql<boolean>`bool_or(coalesce(${itemStates.readLater}, false)) over (partition by ${collapseKey})`.as(
          "group_read_later",
        ),
      dupCount:
        sql<number>`cast(count(*) over (partition by ${collapseKey}) as int)`.as(
          "dup_count",
        ),
      dupFeedTitles: sql<
        (string | null)[]
      >`array_agg(${feedTitle}) over (partition by ${collapseKey})`.as(
        "dup_feed_titles",
      ),
      rn: sql<number>`row_number() over (partition by ${collapseKey} order by ${sortKey} asc, ${itemsTable.id} asc)`.as(
        "rn",
      ),
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
    .as("grouped");

  const outer = [eq(grouped.rn, 1)];
  if (view.unreadOnly) outer.push(sql`${grouped.groupRead} is not true`);
  if (cursor) {
    outer.push(
      sql`(${grouped.sortTs}, ${grouped.id}) < (${cursor.ts}, ${cursor.id})`,
    );
  }

  const rows = await db
    .select({
      id: grouped.id,
      title: grouped.title,
      url: grouped.url,
      author: grouped.author,
      contentHtml: grouped.contentHtml,
      fullContentHtml: grouped.fullContentHtml,
      publishedAt: grouped.publishedAt,
      sortTs: sql<Date>`${grouped.sortTs}`.mapWith((v) => new Date(v)),
      feedId: grouped.feedId,
      feedTitle: grouped.feedTitle,
      read: grouped.groupRead,
      starred: grouped.groupStarred,
      readLater: grouped.groupReadLater,
      dupCount: grouped.dupCount,
      dupFeedTitles: grouped.dupFeedTitles,
    })
    .from(grouped)
    .where(and(...outer))
    .orderBy(sql`${grouped.sortTs} desc`, sql`${grouped.id} desc`)
    .limit(limit + 1);

  const items: ReaderItem[] = rows.slice(0, limit).map((r) => ({
    ...r,
    kind: "item" as const,
    dupFeedTitles: otherFeedTitles(r.dupFeedTitles, r.feedTitle),
  }));
  return { items, hasMore: rows.length > limit };
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
      kind: sql<"item">`'item'`,
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
      readLater: sql<boolean>`coalesce(${itemStates.readLater}, false)`,
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

/** Map a saved web page into the shared ReaderItem shape for the unified views. */
function savedPageToItem(p: SavedPage): ReaderItem {
  let host = p.siteName;
  if (!host) {
    try {
      host = new URL(p.url).hostname.replace(/^www\./, "");
    } catch {
      host = p.url;
    }
  }
  return {
    kind: "page",
    id: p.id,
    title: p.title ?? p.url,
    url: p.url,
    author: p.byline,
    contentHtml: p.contentHtml,
    fullContentHtml: null,
    publishedAt: null,
    sortTs: p.savedAt,
    feedId: 0,
    feedTitle: host,
    read: p.read,
    starred: false,
    readLater: true,
    pageStatus: p.status,
    pageError: p.error,
  };
}

const READ_LATER_LIMIT = 500;

/**
 * The unified Read later view: flagged feed articles and saved web pages merged
 * and sorted newest-saved-first. Capped rather than keyset-paginated — a
 * personal read-later queue stays small, so the client shows it all at once.
 */
export async function listReadLater(userId: number): Promise<ItemsPage> {
  const [feedItems, pages] = await Promise.all([
    listItems(userId, { readLater: true, limit: READ_LATER_LIMIT }),
    listSavedPages(userId),
  ]);
  const merged = [...feedItems.items, ...pages.map(savedPageToItem)].sort(
    (a, b) => b.sortTs.getTime() - a.sortTs.getTime(),
  );
  return { items: merged.slice(0, READ_LATER_LIMIT), hasMore: false };
}

/** Search across feed articles and saved pages, newest first, capped. */
export async function searchEverything(
  userId: number,
  query: string,
): Promise<ReaderItem[]> {
  const [items, pages] = await Promise.all([
    searchItems(userId, query),
    searchSavedPages(userId, query),
  ]);
  return [...items, ...pages.map(savedPageToItem)]
    .sort((a, b) => b.sortTs.getTime() - a.sortTs.getTime())
    .slice(0, SEARCH_LIMIT);
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

/**
 * Expand item ids to include every other copy of the same story — items sharing
 * a canonical_url within the user's own non-muted subscriptions. Lets a single
 * "mark read" on a collapsed row clear all its duplicates ("read once, gone").
 * Items with no canonical_url (or no siblings) just return themselves.
 */
async function expandToSiblings(
  userId: number,
  itemIds: number[],
): Promise<number[]> {
  if (itemIds.length === 0) return itemIds;
  const seed = alias(itemsTable, "seed");
  const rows = await db
    .selectDistinct({ id: itemsTable.id })
    .from(seed)
    .innerJoin(
      itemsTable,
      and(
        isNotNull(seed.canonicalUrl),
        eq(itemsTable.canonicalUrl, seed.canonicalUrl),
      ),
    )
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
    .where(
      and(inArray(seed.id, itemIds), sql`${itemStates.muted} is not true`),
    );
  const ids = new Set(itemIds);
  for (const r of rows) ids.add(r.id);
  return [...ids];
}

/** Mark a batch of items read for one user (scroll-marking, mark-all-read). */
export async function setItemsRead(
  userId: number,
  itemIds: number[],
  opts: { fanOut?: boolean } = {},
): Promise<void> {
  const ids = opts.fanOut ? await expandToSiblings(userId, itemIds) : itemIds;
  const readAt = new Date();
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const chunk = ids.slice(i, i + READ_CHUNK);
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
 * subscription, mark unread items older than the effective cutoff as read —
 * per-feed override, else the user's setting, else DEFAULT_AUTO_READ_DAYS.
 * Called by the scheduler each tick; idempotent. Returns how many were marked.
 */
export async function sweepAutoRead(): Promise<number> {
  const effectiveDays = sql<
    number | null
  >`coalesce((${subscriptions.settings}->>'autoReadDays')::int, (${users.settings}->>'autoReadDays')::int, ${DEFAULT_AUTO_READ_DAYS})`;

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

/**
 * Totals for the Starred and Read later sidebar entries — scoped to the user's
 * current subscriptions and excluding muted items, so they match those views.
 * Read later folds in saved web pages, which the unified view also shows.
 */
export async function savedCounts(
  userId: number,
): Promise<{ starred: number; readLater: number }> {
  const [counts, pages] = await Promise.all([
    db
      .select({
        starred: sql<number>`cast(count(*) filter (where ${itemStates.starred}) as int)`,
        readLater: sql<number>`cast(count(*) filter (where ${itemStates.readLater}) as int)`,
      })
      .from(itemStates)
      .innerJoin(itemsTable, eq(itemsTable.id, itemStates.itemId))
      .innerJoin(
        subscriptions,
        and(
          eq(subscriptions.feedId, itemsTable.feedId),
          eq(subscriptions.userId, userId),
        ),
      )
      .where(
        and(
          eq(itemStates.userId, userId),
          sql`${itemStates.muted} is not true`,
        ),
      ),
    savedPagesCount(userId),
  ]);
  const row = counts[0] ?? { starred: 0, readLater: 0 };
  return { starred: row.starred, readLater: row.readLater + pages };
}

/** Set read-later ("save for later") state for one item for one user. */
export async function setItemReadLater(
  userId: number,
  itemId: number,
  readLater: boolean,
): Promise<void> {
  const readLaterAt = readLater ? new Date() : null;
  await db
    .insert(itemStates)
    .values({ userId, itemId, readLater, readLaterAt })
    .onConflictDoUpdate({
      target: [itemStates.userId, itemStates.itemId],
      set: { readLater, readLaterAt },
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
  opts: { fanOut?: boolean } = {},
): Promise<void> {
  // Reading a collapsed story clears every copy; un-reading touches only this one.
  if (read && opts.fanOut) {
    await setItemsRead(userId, [itemId], { fanOut: true });
    return;
  }
  const readAt = read ? new Date() : null;
  await db
    .insert(itemStates)
    .values({ userId, itemId, read, readAt })
    .onConflictDoUpdate({
      target: [itemStates.userId, itemStates.itemId],
      set: { read, readAt },
    });
}

/** The user's duplicate-collapsing preference (on unless explicitly disabled). */
export async function getCollapseDuplicates(userId: number): Promise<boolean> {
  const rows = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId));
  return rows[0]?.settings?.collapseDuplicates !== false;
}
