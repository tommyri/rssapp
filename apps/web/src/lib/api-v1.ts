import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { feeds, folders, itemStates, items, subscriptions } from "@/db/schema";
import { apiArticleSummary } from "@/lib/api-v1-article-summary";
import {
  type ApiArticleCursor,
  type ApiArticleFilter,
  type ApiMarkAllReadRequest,
  encodeApiArticleCursor,
} from "@/lib/api-v1-input";
import { normalizeStoredArticleHtml } from "@/lib/feeds";
import { markAllRead, type ReaderView } from "@/lib/reader";

export interface ApiSubscription {
  id: string;
  title: string;
  feed: {
    id: string;
    url: string;
    siteUrl: string | null;
  };
  folder: { id: string; name: string } | null;
  unreadCount: number;
  paused: boolean;
}

export interface ApiArticle {
  id: string;
  subscriptionId: string;
  title: string;
  url: string | null;
  canonicalUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  createdAt: string;
  feed: {
    id: string;
    title: string;
    url: string;
    siteUrl: string | null;
  };
  content: {
    html: string | null;
    source: "full" | "feed";
  };
  /** Plain-text row snippet, or null when there is nothing worth previewing. */
  preview: string | null;
  /** Estimated whole minutes to read, or null for an entry too short to estimate. */
  readingTime: number | null;
  audio: { url: string; type: string | null } | null;
  state: {
    read: boolean;
    starred: boolean;
    readLater: boolean;
    readingProgress: number | null;
  };
}

export interface ApiArticlePage {
  data: ApiArticle[];
  pagination: { nextCursor: string | null };
}

export interface ApiArticleQuery {
  limit: number;
  cursor: ApiArticleCursor | null;
  filter: ApiArticleFilter;
  subscriptionId: number | null;
  folderId: number | null;
}

export async function listApiSubscriptions(
  userId: number,
): Promise<ApiSubscription[]> {
  const title = sql<
    string | null
  >`coalesce(${subscriptions.customTitle}, ${feeds.title})`;
  const rows = await db
    .select({
      id: subscriptions.id,
      title,
      feedId: feeds.id,
      feedUrl: feeds.url,
      feedSiteUrl: feeds.siteUrl,
      folderId: folders.id,
      folderName: folders.name,
      unreadCount: sql<number>`cast(count(${items.id}) filter (where ${itemStates.read} is not true and ${itemStates.muted} is not true) as int)`,
      paused: sql<boolean>`coalesce((${subscriptions.settings}->>'paused')::boolean, false)`,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
    .leftJoin(folders, eq(folders.id, subscriptions.folderId))
    .leftJoin(items, eq(items.feedId, feeds.id))
    .leftJoin(
      itemStates,
      and(eq(itemStates.itemId, items.id), eq(itemStates.userId, userId)),
    )
    .where(eq(subscriptions.userId, userId))
    .groupBy(subscriptions.id, feeds.id, folders.id)
    .orderBy(sql`${folders.name} asc nulls last`, asc(title));

  return rows.map((row) => ({
    id: String(row.id),
    title: row.title ?? row.feedUrl,
    feed: {
      id: String(row.feedId),
      url: row.feedUrl,
      siteUrl: row.feedSiteUrl,
    },
    folder:
      row.folderId !== null && row.folderName !== null
        ? { id: String(row.folderId), name: row.folderName }
        : null,
    unreadCount: row.unreadCount,
    paused: row.paused,
  }));
}

/**
 * The stream's sort position: publication date when the feed gave one, ingest
 * date otherwise. `items_feed_sort_idx` indexes this exact expression, so both
 * the ordering and the keyset predicate have to name it rather than
 * `published_at` (AGENTS.md).
 */
const sortAt = sql<Date>`coalesce(${items.publishedAt}, ${items.createdAt})`;

/**
 * Everything that narrows the stream, in one place so the filters provably
 * compose: a view filter, a subscription, a folder and a cursor all AND
 * together.
 */
export function apiArticleStreamConditions(
  userId: number,
  query: ApiArticleQuery,
): SQL[] {
  const conditions: SQL[] = [
    eq(subscriptions.userId, userId),
    sql`${itemStates.muted} is not true`,
  ];
  // Unread is the absence of a diverging item_states row, so it can only be an
  // anti-join over enumerated items (AGENTS.md). Starred and read-later are the
  // opposite: they require a diverging row, so the planner can drive them from
  // the item_states indexes. Either way the ordering predicate stays on
  // coalesce(published_at, created_at) so items_feed_sort_idx still serves it.
  if (query.filter === "unread") {
    conditions.push(sql`${itemStates.read} is not true`);
  } else if (query.filter === "starred") {
    conditions.push(eq(itemStates.starred, true));
  } else if (query.filter === "readLater") {
    conditions.push(eq(itemStates.readLater, true));
  }
  if (query.subscriptionId !== null) {
    conditions.push(eq(subscriptions.id, query.subscriptionId));
  }
  // A subscription and a folder compose: naming both narrows to that
  // subscription when it sits in that folder, and returns nothing when it does
  // not. An unknown id is an empty page rather than an error — a read is not
  // the place to make a client's stale sidebar fail.
  if (query.folderId !== null) {
    conditions.push(eq(subscriptions.folderId, query.folderId));
  }
  if (query.cursor) {
    conditions.push(
      sql`(${sortAt}, ${items.id}) < (${query.cursor.sortAt}, ${query.cursor.articleId})`,
    );
  }
  return conditions;
}

export async function listApiArticles(
  userId: number,
  query: ApiArticleQuery,
): Promise<ApiArticlePage> {
  const title = sql<
    string | null
  >`coalesce(${subscriptions.customTitle}, ${feeds.title})`;
  const conditions = apiArticleStreamConditions(userId, query);

  const rows = await db
    .select({
      id: items.id,
      subscriptionId: subscriptions.id,
      title: items.title,
      url: items.url,
      canonicalUrl: items.canonicalUrl,
      author: items.author,
      contentHtml: items.contentHtml,
      fullContentHtml: items.fullContentHtml,
      audioUrl: items.audioUrl,
      audioType: items.audioType,
      publishedAt: items.publishedAt,
      createdAt: items.createdAt,
      sortAt: sortAt.mapWith((value) => new Date(value)),
      feedId: feeds.id,
      feedTitle: title,
      feedUrl: feeds.url,
      feedSiteUrl: feeds.siteUrl,
      read: sql<boolean>`coalesce(${itemStates.read}, false)`,
      starred: sql<boolean>`coalesce(${itemStates.starred}, false)`,
      readLater: sql<boolean>`coalesce(${itemStates.readLater}, false)`,
      readingProgress: itemStates.readingProgress,
    })
    .from(items)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .innerJoin(feeds, eq(feeds.id, items.feedId))
    .leftJoin(
      itemStates,
      and(eq(itemStates.itemId, items.id), eq(itemStates.userId, userId)),
    )
    .where(and(...conditions))
    .orderBy(desc(sortAt), desc(items.id))
    .limit(query.limit + 1);

  const visible = rows.slice(0, query.limit);
  const hasMore = rows.length > query.limit;
  const last = visible.at(-1);

  return {
    data: visible.map((row) => {
      const useFullContent = row.fullContentHtml !== null;
      const content = useFullContent ? row.fullContentHtml : row.contentHtml;
      const contentUrl = row.canonicalUrl ?? row.url;
      const html = normalizeStoredArticleHtml(content, contentUrl);
      // Derived from the same normalized HTML the web list row derives from, so
      // a native row and a web row show the same preview and estimate.
      const summary = apiArticleSummary(html, row.title);
      return {
        id: String(row.id),
        subscriptionId: String(row.subscriptionId),
        title: row.title ?? "Untitled article",
        url: row.url,
        canonicalUrl: row.canonicalUrl,
        author: row.author,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        feed: {
          id: String(row.feedId),
          title: row.feedTitle ?? row.feedUrl,
          url: row.feedUrl,
          siteUrl: row.feedSiteUrl,
        },
        content: {
          html,
          source: useFullContent ? "full" : "feed",
        },
        preview: summary.preview,
        readingTime: summary.readingTime,
        audio: row.audioUrl ? { url: row.audioUrl, type: row.audioType } : null,
        state: {
          read: row.read,
          starred: row.starred,
          readLater: row.readLater,
          readingProgress: row.readingProgress,
        },
      };
    }),
    pagination: {
      nextCursor:
        hasMore && last
          ? encodeApiArticleCursor({
              sortAt: last.sortAt,
              articleId: last.id,
            })
          : null,
    },
  };
}

type ApiTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * True only when every id is reachable through this user's subscriptions. Run
 * inside the writing transaction so validation and the write are one check: a
 * batch containing a foreign article must not update the rest of it. Takes
 * already-deduplicated ids, which is how the count comparison stays exact.
 */
async function ownsEveryArticle(
  tx: ApiTransaction,
  userId: number,
  distinctIds: number[],
): Promise<boolean> {
  const owned = await tx
    .select({ id: items.id })
    .from(items)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .where(inArray(items.id, distinctIds));
  return new Set(owned.map((row) => row.id)).size === distinctIds.length;
}

/**
 * Updates only articles reachable through this user's subscriptions. The
 * transaction makes validation and the idempotent upsert one ownership check.
 */
export async function setApiArticleReadState(
  userId: number,
  articleIds: number[],
  read: boolean,
): Promise<number[] | null> {
  const distinctIds = [...new Set(articleIds)];
  return db.transaction(async (tx) => {
    if (!(await ownsEveryArticle(tx, userId, distinctIds))) return null;

    const readAt = read ? new Date() : null;
    await tx
      .insert(itemStates)
      .values(distinctIds.map((itemId) => ({ userId, itemId, read, readAt })))
      .onConflictDoUpdate({
        target: [itemStates.userId, itemStates.itemId],
        set: {
          read,
          readAt: read
            ? sql`coalesce(${itemStates.readAt}, excluded.read_at)`
            : null,
        },
      });
    return distinctIds;
  });
}

/**
 * Batched star state, validated as one owned batch like read state. Unlike
 * `readAt`, `starredAt` records the current decision rather than the first one —
 * the same rule the web's own star action follows (`setItemStarred`), so a
 * re-star reads as newly starred on both surfaces.
 */
export async function setApiArticleStarredState(
  userId: number,
  articleIds: number[],
  starred: boolean,
): Promise<number[] | null> {
  const distinctIds = [...new Set(articleIds)];
  return db.transaction(async (tx) => {
    if (!(await ownsEveryArticle(tx, userId, distinctIds))) return null;

    const starredAt = starred ? new Date() : null;
    await tx
      .insert(itemStates)
      .values(
        distinctIds.map((itemId) => ({ userId, itemId, starred, starredAt })),
      )
      .onConflictDoUpdate({
        target: [itemStates.userId, itemStates.itemId],
        set: { starred, starredAt },
      });
    return distinctIds;
  });
}

/** Batched read-later state, matching the web's `setItemReadLater` semantics. */
export async function setApiArticleReadLaterState(
  userId: number,
  articleIds: number[],
  readLater: boolean,
): Promise<number[] | null> {
  const distinctIds = [...new Set(articleIds)];
  return db.transaction(async (tx) => {
    if (!(await ownsEveryArticle(tx, userId, distinctIds))) return null;

    const readLaterAt = readLater ? new Date() : null;
    await tx
      .insert(itemStates)
      .values(
        distinctIds.map((itemId) => ({
          userId,
          itemId,
          readLater,
          readLaterAt,
        })),
      )
      .onConflictDoUpdate({
        target: [itemStates.userId, itemStates.itemId],
        set: { readLater, readLaterAt },
      });
    return distinctIds;
  });
}

/**
 * Resolves an owned subscription to the feed its articles live under. The
 * reader's views are keyed by feed, and (user, feed) is unique, so this is also
 * the ownership check for a subscription-scoped sweep.
 */
async function ownedSubscriptionFeedId(
  userId: number,
  subscriptionId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ feedId: subscriptions.feedId })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.userId, userId),
      ),
    )
    .limit(1);
  return row?.feedId ?? null;
}

async function ownsFolder(userId: number, folderId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .limit(1);
  return row !== undefined;
}

/**
 * The overload valve: mark a whole scope read, optionally only the part of it
 * older than a cutoff. Delegates to the web's `markAllRead` so a native sweep
 * and a web sweep cover exactly the same articles — non-muted, unread, and
 * sorted strictly before `olderThan` when one is given.
 *
 * Returns how many articles changed, or null when the scope is not this
 * account's. A read tolerates an unknown id by returning nothing; a sweep must
 * not report success for a scope the caller misidentified.
 */
export async function markApiArticlesRead(
  userId: number,
  request: ApiMarkAllReadRequest,
): Promise<number | null> {
  const view: ReaderView = {};
  if (request.subscriptionId !== null) {
    const feedId = await ownedSubscriptionFeedId(
      userId,
      request.subscriptionId,
    );
    if (feedId === null) return null;
    view.feedId = feedId;
  }
  if (request.folderId !== null) {
    if (!(await ownsFolder(userId, request.folderId))) return null;
    view.folderId = request.folderId;
  }
  return markAllRead(userId, view, request.olderThan ?? undefined);
}
