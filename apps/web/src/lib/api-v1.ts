import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { feeds, folders, itemStates, items, subscriptions } from "@/db/schema";
import {
  type ApiArticleCursor,
  encodeApiArticleCursor,
} from "@/lib/api-v1-input";
import { normalizeStoredArticleHtml } from "@/lib/feeds";

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
  unreadOnly: boolean;
  subscriptionId: number | null;
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

export async function listApiArticles(
  userId: number,
  query: ApiArticleQuery,
): Promise<ApiArticlePage> {
  const sortAt = sql<Date>`coalesce(${items.publishedAt}, ${items.createdAt})`;
  const title = sql<
    string | null
  >`coalesce(${subscriptions.customTitle}, ${feeds.title})`;
  const conditions: SQL[] = [
    eq(subscriptions.userId, userId),
    sql`${itemStates.muted} is not true`,
  ];
  if (query.unreadOnly) conditions.push(sql`${itemStates.read} is not true`);
  if (query.subscriptionId !== null) {
    conditions.push(eq(subscriptions.id, query.subscriptionId));
  }
  if (query.cursor) {
    conditions.push(
      sql`(${sortAt}, ${items.id}) < (${query.cursor.sortAt}, ${query.cursor.articleId})`,
    );
  }

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
          html: normalizeStoredArticleHtml(content, contentUrl),
          source: useFullContent ? "full" : "feed",
        },
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
    const ownedIds = new Set(owned.map((row) => row.id));
    if (ownedIds.size !== distinctIds.length) return null;

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
