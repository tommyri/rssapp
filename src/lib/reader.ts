import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { db } from "@/db";
import {
  feeds,
  folders,
  itemAudioProgress,
  itemLabels,
  itemStates,
  items as itemsTable,
  labels,
  subscriptions,
  users,
} from "@/db/schema";
import {
  type ArticleListDensity,
  normalizeArticleListDensity,
} from "@/lib/article-list-density";
import type { AudioProgressByUrl } from "@/lib/audio-progress";
import { otherFeedTitles } from "@/lib/duplicates";
import {
  type EmbedLoadingPreferences,
  normalizeEmbedLoadingPreferences,
} from "@/lib/embed-loading";
import { normalizeStoredArticleHtml } from "@/lib/feeds";
import type { FullContentStatus } from "@/lib/feeds/full-content-policy";
import { getHighlightTarget } from "@/lib/highlights";
import { labelsForTargets, type ReaderLabel } from "@/lib/labels";
import { notificationItemId } from "@/lib/notifications";
import type { ExportEntry } from "@/lib/opml";
import { DEFAULT_AUTO_READ_DAYS } from "@/lib/reading-prefs";
import {
  getSavedPage,
  listSavedPages,
  type SavedPage,
  savedPagesCount,
  searchSavedPages,
} from "@/lib/saved-pages";
import type { SortOrder } from "@/lib/subscription-settings";

// A healthy feed whose newest article is older than this is "silent" — the
// site likely stopped publishing (or the feed moved). Surfaced on Manage feeds.
export const SILENT_AFTER_DAYS = 90;

export interface FeedSummary {
  feedId: number;
  title: string | null;
  url: string;
  siteUrl: string | null;
  unread: number;
  lastError: string | null;
  /** Fetching paused by the user (feed health); shown in the sidebar. */
  paused: boolean;
  folderId: number | null;
  folderName: string | null;
  /* Raw values for the per-feed edit menu: */
  customTitle: string | null;
  feedTitle: string | null;
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
        paused: sql<boolean>`coalesce((${subscriptions.settings}->>'paused')::boolean, false)`,
        folderId: folders.id,
        folderName: folders.name,
        customTitle: subscriptions.customTitle,
        feedTitle: feeds.title,
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

export interface SidebarFolder {
  id: number;
  name: string;
}

/** Every folder, including empty ones, in a stable default order. */
export async function listSidebarFolders(
  userId: number,
): Promise<SidebarFolder[]> {
  return db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(eq(folders.userId, userId))
    .orderBy(asc(folders.name));
}

export interface ManagedFeed {
  feedId: number;
  url: string;
  siteUrl: string | null;
  title: string | null;
  customTitle: string | null;
  feedTitle: string | null;
  folderName: string | null;
  autoReadDays: number | null;
  sortOrder: SortOrder;
  defaultUnreadOnly: boolean;
  paused: boolean;
  unread: number;
  itemCount: number;
  /** Newest stored article's timestamp — the "has this feed gone silent?" signal. */
  latestItemAt: Date | null;
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
      siteUrl: feeds.siteUrl,
      title: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      customTitle: subscriptions.customTitle,
      feedTitle: feeds.title,
      folderName: folders.name,
      autoReadDays: sql<
        number | null
      >`(${subscriptions.settings}->>'autoReadDays')::int`,
      sortOrder: sql<SortOrder>`case when ${subscriptions.settings}->>'sortOrder' = 'oldest' then 'oldest' else 'newest' end`,
      defaultUnreadOnly: sql<boolean>`coalesce((${subscriptions.settings}->>'defaultUnreadOnly')::boolean, true)`,
      paused: sql<boolean>`coalesce((${subscriptions.settings}->>'paused')::boolean, false)`,
      unread: sql<number>`cast(count(${itemsTable.id}) filter (where ${itemStates.read} is not true and ${itemStates.muted} is not true) as int)`,
      itemCount: sql<number>`cast(count(${itemsTable.id}) as int)`,
      latestItemAt:
        sql<Date | null>`max(coalesce(${itemsTable.publishedAt}, ${itemsTable.createdAt}))`.mapWith(
          (v) => (v ? new Date(v) : null),
        ),
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
  return (await listSidebarFolders(userId)).map((folder) => folder.name);
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
  /** Background full-text extraction state for feed articles. */
  fullContentStatus?: FullContentStatus;
  audioUrl: string | null;
  audioType: string | null;
  publishedAt: Date | null;
  /** Stable sort key (published_at falling back to created_at); cursor basis. */
  sortTs: Date;
  feedId: number;
  feedTitle: string | null;
  read: boolean;
  starred: boolean;
  readLater: boolean;
  /** Fraction through the readable article body; null when not resumable. */
  readingProgress: number | null;
  /** Absolute seconds for each audio source embedded by this item. */
  audioProgress: AudioProgressByUrl;
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
  /** Per-user labels, loaded for all online reader views. */
  labels?: ReaderLabel[];
}

/** Which articles to show — a feed, a folder, starred, read-later, or everything. */
export interface ReaderView {
  feedId?: number;
  folderId?: number;
  starred?: boolean;
  readLater?: boolean;
  unreadOnly?: boolean;
  /**
   * The older, already-read continuation of a single feed's unread queue.
   * This is intentionally separate from the normal “show all” view.
   */
  readOnly?: boolean;
  /** Oldest-first when viewing a single feed; ignored for folder/all views. */
  sortOrder?: SortOrder;
  /**
   * Collapse the same story arriving from multiple feeds into one row (the
   * user's setting). Applies only to multi-feed list views (All, folder) —
   * single-feed, Starred and Read later are never collapsed.
   */
  collapse?: boolean;
  /** Shows the user's unified feed-item and saved-page label view. */
  labelId?: number;
  /** A direct source row, used when returning to an annotation. */
  itemId?: number;
  /** Reader source routes may reveal a muted item without changing its mute state. */
  includeMuted?: boolean;
  /** A one-item annotation source behaves as an archive, not an unread feed. */
  highlight?: boolean;
  /** A one-item notification source behaves as an archive, not an unread feed. */
  notification?: boolean;
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
  const conditions = [eq(subscriptions.userId, userId)];
  if (!view.includeMuted) conditions.push(sql`${itemStates.muted} is not true`);
  if (view.feedId) conditions.push(eq(itemsTable.feedId, view.feedId));
  if (view.folderId) conditions.push(eq(subscriptions.folderId, view.folderId));
  if (view.itemId) conditions.push(eq(itemsTable.id, view.itemId));
  if (view.starred) conditions.push(eq(itemStates.starred, true));
  if (view.readLater) conditions.push(eq(itemStates.readLater, true));
  if (view.labelId) {
    conditions.push(sql`exists (
      select 1 from ${itemLabels}
      inner join ${labels} on ${labels.id} = ${itemLabels.labelId}
      where ${itemLabels.itemId} = ${itemsTable.id}
        and ${labels.id} = ${view.labelId}
        and ${labels.userId} = ${userId}
    )`);
  }
  if (view.readOnly) conditions.push(eq(itemStates.read, true));
  else if (view.unreadOnly)
    conditions.push(sql`${itemStates.read} is not true`);
  return conditions;
}

async function attachReaderLabels(
  userId: number,
  readerItems: ReaderItem[],
): Promise<ReaderItem[]> {
  if (readerItems.length === 0) return readerItems;
  const itemIds = readerItems
    .filter((item) => item.kind === "item")
    .map((item) => item.id);
  const savedAudioProgress =
    itemIds.length > 0
      ? await db
          .select({
            itemId: itemAudioProgress.itemId,
            audioUrl: itemAudioProgress.audioUrl,
            progressSeconds: itemAudioProgress.progressSeconds,
          })
          .from(itemAudioProgress)
          .where(
            and(
              eq(itemAudioProgress.userId, userId),
              inArray(itemAudioProgress.itemId, itemIds),
            ),
          )
      : [];
  const audioProgressByItem = new Map<number, AudioProgressByUrl>();
  for (const audio of savedAudioProgress) {
    const current = audioProgressByItem.get(audio.itemId) ?? {};
    current[audio.audioUrl] = audio.progressSeconds;
    audioProgressByItem.set(audio.itemId, current);
  }
  const byTarget = await labelsForTargets(
    userId,
    readerItems.map((item) =>
      item.kind === "item"
        ? { kind: "item", itemId: item.id }
        : { kind: "page", savedPageId: item.id },
    ),
  );
  return readerItems.map((item) => {
    const contentHtml = normalizeStoredArticleHtml(item.contentHtml, item.url);
    const fullContentHtml = normalizeStoredArticleHtml(
      item.fullContentHtml,
      item.url,
    );
    return {
      ...item,
      contentHtml,
      fullContentHtml,
      audioProgress:
        item.kind === "item" ? (audioProgressByItem.get(item.id) ?? {}) : {},
      labels: byTarget.get(`${item.kind}:${item.id}`) ?? [],
    };
  });
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
    opts.itemId === undefined &&
    !opts.starred &&
    !opts.readLater &&
    !opts.labelId
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
      fullContentStatus: itemsTable.fullContentStatus,
      audioUrl: itemsTable.audioUrl,
      audioType: itemsTable.audioType,
      publishedAt: itemsTable.publishedAt,
      sortTs: sql<Date>`${sortKey}`.mapWith((v) => new Date(v)),
      feedId: feeds.id,
      feedTitle: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      read: sql<boolean>`coalesce(${itemStates.read}, false)`,
      starred: sql<boolean>`coalesce(${itemStates.starred}, false)`,
      readLater: sql<boolean>`coalesce(${itemStates.readLater}, false)`,
      readingProgress: itemStates.readingProgress,
      audioProgress: sql<AudioProgressByUrl>`'{}'::jsonb`,
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

  return {
    items: await attachReaderLabels(userId, rows.slice(0, limit)),
    hasMore: rows.length > limit,
  };
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
      fullContentStatus: itemsTable.fullContentStatus,
      audioUrl: itemsTable.audioUrl,
      audioType: itemsTable.audioType,
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
      readingProgress: itemStates.readingProgress,
      audioProgress: sql<AudioProgressByUrl>`'{}'::jsonb`.as("audio_progress"),
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
      fullContentStatus: grouped.fullContentStatus,
      audioUrl: grouped.audioUrl,
      audioType: grouped.audioType,
      publishedAt: grouped.publishedAt,
      sortTs: sql<Date>`${grouped.sortTs}`.mapWith((v) => new Date(v)),
      feedId: grouped.feedId,
      feedTitle: grouped.feedTitle,
      read: grouped.groupRead,
      starred: grouped.groupStarred,
      readLater: grouped.groupReadLater,
      readingProgress: grouped.readingProgress,
      audioProgress: grouped.audioProgress,
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
  return {
    items: await attachReaderLabels(userId, items),
    hasMore: rows.length > limit,
  };
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

  const rows = await db
    .select({
      kind: sql<"item">`'item'`,
      id: itemsTable.id,
      title: itemsTable.title,
      url: itemsTable.url,
      author: itemsTable.author,
      contentHtml: itemsTable.contentHtml,
      fullContentHtml: itemsTable.fullContentHtml,
      fullContentStatus: itemsTable.fullContentStatus,
      audioUrl: itemsTable.audioUrl,
      audioType: itemsTable.audioType,
      publishedAt: itemsTable.publishedAt,
      sortTs: sql<Date>`${sortKey}`.mapWith((v) => new Date(v)),
      feedId: feeds.id,
      feedTitle: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      read: sql<boolean>`coalesce(${itemStates.read}, false)`,
      starred: sql<boolean>`coalesce(${itemStates.starred}, false)`,
      readLater: sql<boolean>`coalesce(${itemStates.readLater}, false)`,
      readingProgress: itemStates.readingProgress,
      audioProgress: sql<AudioProgressByUrl>`'{}'::jsonb`,
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
  return attachReaderLabels(userId, rows);
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
    audioUrl: null,
    audioType: null,
    publishedAt: null,
    sortTs: p.savedAt,
    feedId: 0,
    feedTitle: host,
    read: p.read,
    starred: false,
    readLater: true,
    readingProgress: p.readingProgress,
    audioProgress: {},
    pageStatus: p.status,
    pageError: p.error,
  };
}

/** Resolve an owned annotation back to its exact reader item or saved page. */
export async function getReaderItemForHighlight(
  userId: number,
  highlightId: number,
): Promise<ReaderItem | null> {
  const target = await getHighlightTarget(userId, highlightId);
  if (!target) return null;
  if (target.kind === "item") {
    const page = await listItems(userId, {
      itemId: target.id,
      includeMuted: true,
      limit: 1,
    });
    return page.items[0] ?? null;
  }

  const savedPage = await getSavedPage(userId, target.id);
  if (!savedPage) return null;
  const [readerItem] = await attachReaderLabels(userId, [
    savedPageToItem(savedPage),
  ]);
  return readerItem ?? null;
}

/** Open an inbox article through the normal reader, including muted matches. */
export async function getReaderItemForNotification(
  userId: number,
  notificationId: number,
): Promise<ReaderItem | null> {
  const itemId = await notificationItemId(userId, notificationId);
  if (itemId === null) return null;
  const page = await listItems(userId, {
    itemId,
    includeMuted: true,
    limit: 1,
  });
  return page.items[0] ?? null;
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
  const savedItems = await attachReaderLabels(
    userId,
    pages.map(savedPageToItem),
  );
  const merged = [...feedItems.items, ...savedItems].sort(
    (a, b) => b.sortTs.getTime() - a.sortTs.getTime(),
  );
  return { items: merged.slice(0, READ_LATER_LIMIT), hasMore: false };
}

/** The unified archive for one user-owned label, newest first. */
export async function listLabelItems(
  userId: number,
  labelId: number,
): Promise<ItemsPage> {
  const [feedItems, pages] = await Promise.all([
    listItems(userId, { labelId, limit: READ_LATER_LIMIT }),
    listSavedPages(userId, labelId),
  ]);
  const savedItems = await attachReaderLabels(
    userId,
    pages.map(savedPageToItem),
  );
  const merged = [...feedItems.items, ...savedItems].sort(
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
  const savedItems = await attachReaderLabels(
    userId,
    pages.map(savedPageToItem),
  );
  return [...items, ...savedItems]
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

/** Store a resumable article position without changing its read/star state. */
export async function setItemReadingProgress(
  userId: number,
  itemId: number,
  readingProgress: number | null,
): Promise<void> {
  await db
    .insert(itemStates)
    .values({
      userId,
      itemId,
      readingProgress,
      readingProgressUpdatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [itemStates.userId, itemStates.itemId],
      set: { readingProgress, readingProgressUpdatedAt: new Date() },
    });
}

/** Persist a listener's position only when the article remains in their reader. */
export async function setItemAudioProgress(
  userId: number,
  itemId: number,
  audioUrl: string,
  audioProgressSeconds: number | null,
): Promise<boolean> {
  const [subscribedItem] = await db
    .select({ id: itemsTable.id })
    .from(itemsTable)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, itemsTable.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .where(eq(itemsTable.id, itemId))
    .limit(1);
  if (!subscribedItem) return false;

  const updatedAt = new Date();
  if (audioProgressSeconds === null) {
    await db
      .delete(itemAudioProgress)
      .where(
        and(
          eq(itemAudioProgress.userId, userId),
          eq(itemAudioProgress.itemId, itemId),
          eq(itemAudioProgress.audioUrl, audioUrl),
        ),
      );
    return true;
  }
  await db
    .insert(itemAudioProgress)
    .values({
      userId,
      itemId,
      audioUrl,
      progressSeconds: audioProgressSeconds,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [
        itemAudioProgress.userId,
        itemAudioProgress.itemId,
        itemAudioProgress.audioUrl,
      ],
      set: { progressSeconds: audioProgressSeconds, updatedAt },
    });
  return true;
}

/** The user's duplicate-collapsing preference (on unless explicitly disabled). */
export async function getCollapseDuplicates(userId: number): Promise<boolean> {
  const rows = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId));
  return rows[0]?.settings?.collapseDuplicates !== false;
}

export async function getArticleListDensity(
  userId: number,
): Promise<ArticleListDensity> {
  const rows = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId));
  return normalizeArticleListDensity(rows[0]?.settings?.articleListDensity);
}

export async function getEmbedLoadingPreferences(
  userId: number,
): Promise<EmbedLoadingPreferences> {
  const rows = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId));
  return normalizeEmbedLoadingPreferences(rows[0]?.settings?.embedLoading);
}
