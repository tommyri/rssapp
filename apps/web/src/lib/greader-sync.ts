import { and, asc, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  feeds,
  folders,
  itemLabels,
  itemStates,
  items,
  labels,
  subscriptions,
} from "@/db/schema";
import { normalizeStoredArticleHtml } from "@/lib/feeds";
import { addFeedForUser } from "@/lib/feeds/ingest";
import {
  encodeGReaderContinuation,
  feedStreamId,
  GOOGLE_READER_READ,
  GOOGLE_READER_READING_LIST,
  GOOGLE_READER_STARRED,
  type GReaderContinuation,
  type GReaderStream,
  googleReaderItemId,
  isGoogleReaderStateTag,
  labelStreamId,
  parseGReaderStream,
  toGReaderTimestampUsec,
} from "@/lib/greader-protocol";
import {
  createLabel,
  labelsForTargets,
  normalizeLabelName,
} from "@/lib/labels";
import { setItemsRead } from "@/lib/reader";
import { ensureFolder, unsubscribe } from "@/lib/subscriptions";

const WRITE_CHUNK = 250;

type ItemRow = {
  id: number;
  title: string | null;
  author: string | null;
  url: string | null;
  canonicalUrl: string | null;
  contentHtml: string | null;
  fullContentHtml: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  feedUrl: string;
  feedTitle: string | null;
  feedSiteUrl: string | null;
  folderName: string | null;
  read: boolean | null;
  starred: boolean | null;
};

export interface GReaderStreamQuery {
  stream: GReaderStream;
  limit: number;
  continuation: GReaderContinuation | null;
  oldest: boolean;
  newerThan: Date | null;
  excludeTags: Set<string>;
}

export interface GReaderStreamResponse {
  id: string;
  title: string;
  updated: string;
  items: GReaderItem[];
  continuation?: string;
}

export interface GReaderItemIdsResponse {
  itemRefs: Array<{ id: string; directStreamIds: string[] }>;
  continuation?: string;
}

export interface GReaderItem {
  id: string;
  crawlTimeMsec: string;
  timestampUsec: string;
  title: string;
  published: string;
  updated: string;
  alternate: Array<{ href: string; type: "text/html" }>;
  canonical: Array<{ href: string }>;
  summary: { content: string; direction: "ltr" };
  content: { content: string; direction: "ltr" };
  categories: string[];
  origin: { streamId: string; title: string; htmlUrl: string };
  author?: string;
}

function chunk<T>(values: T[], size = WRITE_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function dateForRow(row: ItemRow): Date {
  return row.publishedAt ?? row.createdAt;
}

function itemColumns() {
  return {
    id: items.id,
    title: items.title,
    author: items.author,
    url: items.url,
    canonicalUrl: items.canonicalUrl,
    contentHtml: items.contentHtml,
    fullContentHtml: items.fullContentHtml,
    publishedAt: items.publishedAt,
    createdAt: items.createdAt,
    feedUrl: feeds.url,
    feedTitle: sql<
      string | null
    >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
    feedSiteUrl: feeds.siteUrl,
    folderName: folders.name,
    read: itemStates.read,
    starred: itemStates.starred,
  };
}

async function tagTargets(userId: number, name: string) {
  const [folder, label] = await Promise.all([
    db.query.folders.findFirst({
      columns: { id: true },
      where: and(eq(folders.userId, userId), eq(folders.name, name)),
    }),
    db.query.labels.findFirst({
      columns: { id: true },
      where: and(eq(labels.userId, userId), eq(labels.name, name)),
    }),
  ]);
  return { folderId: folder?.id ?? null, labelId: label?.id ?? null };
}

/** Converts a legacy stream into only user-scoped SQL conditions. */
async function streamConditions(
  userId: number,
  stream: GReaderStream,
): Promise<SQL[]> {
  if (stream.kind === "reading-list") return [];
  if (stream.kind === "read") return [sql`${itemStates.read} is true`];
  if (stream.kind === "starred") return [sql`${itemStates.starred} is true`];
  if (stream.kind === "feed") return [eq(feeds.url, stream.url)];

  const target = await tagTargets(userId, stream.name);
  const conditions: SQL[] = [];
  if (target.folderId !== null) {
    conditions.push(eq(subscriptions.folderId, target.folderId));
  }
  if (target.labelId !== null) {
    conditions.push(sql`exists (
      select 1 from ${itemLabels}
      where ${itemLabels.itemId} = ${items.id}
        and ${itemLabels.labelId} = ${target.labelId}
    )`);
  }
  return conditions.length ? [or(...conditions) as SQL] : [sql`false`];
}

async function selectItemRows(
  userId: number,
  conditions: SQL[],
  {
    limit,
    oldest,
  }: {
    limit: number;
    oldest: boolean;
  },
): Promise<ItemRow[]> {
  const sortAt = sql<Date>`coalesce(${items.publishedAt}, ${items.createdAt})`;
  return db
    .select(itemColumns())
    .from(items)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .innerJoin(feeds, eq(feeds.id, items.feedId))
    .leftJoin(folders, eq(folders.id, subscriptions.folderId))
    .leftJoin(
      itemStates,
      and(eq(itemStates.itemId, items.id), eq(itemStates.userId, userId)),
    )
    .where(and(sql`${itemStates.muted} is not true`, ...conditions))
    .orderBy(
      oldest ? asc(sortAt) : desc(sortAt),
      oldest ? asc(items.id) : desc(items.id),
    )
    .limit(limit) as Promise<ItemRow[]>;
}

/** The ID sync endpoint must not fetch or serialize article HTML. */
async function selectItemIdRows(
  userId: number,
  conditions: SQL[],
  {
    limit,
    oldest,
  }: {
    limit: number;
    oldest: boolean;
  },
): Promise<Array<{ id: number; sortAt: Date }>> {
  const sortAt = sql<Date>`coalesce(${items.publishedAt}, ${items.createdAt})`;
  return db
    .select({ id: items.id, sortAt })
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
    .where(and(sql`${itemStates.muted} is not true`, ...conditions))
    .orderBy(
      oldest ? asc(sortAt) : desc(sortAt),
      oldest ? asc(items.id) : desc(items.id),
    )
    .limit(limit) as Promise<Array<{ id: number; sortAt: Date }>>;
}

function itemCategories(
  row: ItemRow,
  itemLabelsForRow: Array<{ name: string }>,
): string[] {
  const categories = [GOOGLE_READER_READING_LIST, feedStreamId(row.feedUrl)];
  if (row.read) categories.push(GOOGLE_READER_READ);
  if (row.starred) categories.push(GOOGLE_READER_STARRED);
  if (row.folderName) categories.push(labelStreamId(row.folderName));
  for (const label of itemLabelsForRow)
    categories.push(labelStreamId(label.name));
  return [...new Set(categories)];
}

function serializeItem(
  row: ItemRow,
  itemLabelsForRow: Array<{ name: string }>,
): GReaderItem {
  const updatedAt = dateForRow(row);
  const url = row.canonicalUrl ?? row.url;
  const summaryHtml = normalizeStoredArticleHtml(row.contentHtml, url) ?? "";
  const contentHtml =
    normalizeStoredArticleHtml(row.fullContentHtml ?? row.contentHtml, url) ??
    "";

  return {
    id: googleReaderItemId(row.id),
    crawlTimeMsec: String(row.createdAt.getTime()),
    timestampUsec: toGReaderTimestampUsec(updatedAt),
    title: row.title ?? "Untitled article",
    published: String(Math.floor(updatedAt.getTime() / 1_000)),
    updated: String(Math.floor(row.createdAt.getTime() / 1_000)),
    alternate: url ? [{ href: url, type: "text/html" }] : [],
    canonical: url ? [{ href: url }] : [],
    summary: { content: summaryHtml, direction: "ltr" },
    content: { content: contentHtml, direction: "ltr" },
    categories: itemCategories(row, itemLabelsForRow),
    origin: {
      streamId: feedStreamId(row.feedUrl),
      title: row.feedTitle ?? row.feedUrl,
      htmlUrl: row.feedSiteUrl ?? "",
    },
    ...(row.author ? { author: row.author } : {}),
  };
}

async function serializeItems(
  userId: number,
  rows: ItemRow[],
): Promise<GReaderItem[]> {
  const byTarget = await labelsForTargets(
    userId,
    rows.map((row) => ({ kind: "item" as const, itemId: row.id })),
  );
  return rows.map((row) =>
    serializeItem(row, byTarget.get(`item:${row.id}`) ?? []),
  );
}

export async function listGReaderStream(
  userId: number,
  query: GReaderStreamQuery,
): Promise<GReaderStreamResponse> {
  const sortAt = sql<Date>`coalesce(${items.publishedAt}, ${items.createdAt})`;
  const conditions = await streamConditions(userId, query.stream);
  if (query.newerThan) conditions.push(sql`${sortAt} > ${query.newerThan}`);
  if (query.continuation) {
    const cursorDate = new Date(query.continuation.sortAt);
    conditions.push(
      query.oldest
        ? sql`(${sortAt}, ${items.id}) > (${cursorDate}, ${query.continuation.itemId})`
        : sql`(${sortAt}, ${items.id}) < (${cursorDate}, ${query.continuation.itemId})`,
    );
  }
  if (query.excludeTags.has(GOOGLE_READER_READ)) {
    conditions.push(sql`${itemStates.read} is not true`);
  }
  if (query.excludeTags.has(GOOGLE_READER_STARRED)) {
    conditions.push(sql`${itemStates.starred} is not true`);
  }

  const rows = await selectItemRows(userId, conditions, {
    limit: query.limit + 1,
    oldest: query.oldest,
  });
  const hasMore = rows.length > query.limit;
  const visible = hasMore ? rows.slice(0, -1) : rows;
  const last = visible.at(-1);
  const itemsForResponse = await serializeItems(userId, visible);
  const rawStream = streamIdFor(query.stream);

  return {
    id: rawStream,
    title: streamTitle(query.stream),
    updated: String(Math.floor(Date.now() / 1_000)),
    items: itemsForResponse,
    ...(hasMore && last
      ? {
          continuation: encodeGReaderContinuation({
            sortAt: dateForRow(last).toISOString(),
            itemId: last.id,
          }),
        }
      : {}),
  };
}

/**
 * The normal first phase of a native sync: fetch a compact ordered set of
 * stable ids, then request only the changed entries' content separately.
 */
export async function listGReaderStreamItemIds(
  userId: number,
  query: GReaderStreamQuery,
): Promise<GReaderItemIdsResponse> {
  const sortAt = sql<Date>`coalesce(${items.publishedAt}, ${items.createdAt})`;
  const conditions = await streamConditions(userId, query.stream);
  if (query.newerThan) conditions.push(sql`${sortAt} > ${query.newerThan}`);
  if (query.continuation) {
    const cursorDate = new Date(query.continuation.sortAt);
    conditions.push(
      query.oldest
        ? sql`(${sortAt}, ${items.id}) > (${cursorDate}, ${query.continuation.itemId})`
        : sql`(${sortAt}, ${items.id}) < (${cursorDate}, ${query.continuation.itemId})`,
    );
  }
  if (query.excludeTags.has(GOOGLE_READER_READ)) {
    conditions.push(sql`${itemStates.read} is not true`);
  }
  if (query.excludeTags.has(GOOGLE_READER_STARRED)) {
    conditions.push(sql`${itemStates.starred} is not true`);
  }

  const rows = await selectItemIdRows(userId, conditions, {
    limit: query.limit + 1,
    oldest: query.oldest,
  });
  const hasMore = rows.length > query.limit;
  const visible = hasMore ? rows.slice(0, -1) : rows;
  const last = visible.at(-1);
  return {
    itemRefs: visible.map((row) => ({
      id: googleReaderItemId(row.id),
      directStreamIds: [],
    })),
    ...(hasMore && last
      ? {
          continuation: encodeGReaderContinuation({
            sortAt: last.sortAt.toISOString(),
            itemId: last.id,
          }),
        }
      : {}),
  };
}

export async function listGReaderItemsById(
  userId: number,
  requestedIds: number[],
): Promise<GReaderItem[]> {
  const ids = [...new Set(requestedIds)].slice(0, 1_000);
  if (!ids.length) return [];

  const rows = await selectItemRows(userId, [inArray(items.id, ids)], {
    limit: ids.length,
    oldest: false,
  });
  const serialized = await serializeItems(userId, rows);
  const byId = new Map(serialized.map((item) => [item.id, item] as const));
  return ids
    .map((id) => byId.get(googleReaderItemId(id)))
    .filter((item): item is GReaderItem => Boolean(item));
}

export async function listGReaderSubscriptions(userId: number) {
  const rows = await db
    .select({
      url: feeds.url,
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

  return {
    subscriptions: rows.map((row) => ({
      id: feedStreamId(row.url),
      title: row.title ?? row.url,
      htmlUrl: row.htmlUrl ?? "",
      categories: row.folderName
        ? [{ id: labelStreamId(row.folderName), label: row.folderName }]
        : [],
    })),
  };
}

export async function listGReaderTags(userId: number) {
  const [folderRows, labelRows] = await Promise.all([
    db
      .select({ name: folders.name })
      .from(folders)
      .where(eq(folders.userId, userId))
      .orderBy(asc(folders.name)),
    db
      .select({ name: labels.name })
      .from(labels)
      .where(eq(labels.userId, userId))
      .orderBy(asc(labels.name)),
  ]);
  const names = [
    ...new Set([...folderRows, ...labelRows].map((row) => row.name)),
  ];
  return {
    tags: [
      { id: GOOGLE_READER_READING_LIST, sortid: "00000001" },
      { id: GOOGLE_READER_READ, sortid: "00000002" },
      { id: GOOGLE_READER_STARRED, sortid: "00000003" },
      ...names.map((name, index) => ({
        id: labelStreamId(name),
        sortid: String(index + 4).padStart(8, "0"),
      })),
    ],
  };
}

export async function listGReaderUnreadCounts(userId: number) {
  const rows = await db
    .select({
      url: feeds.url,
      folderName: folders.name,
      count: sql<number>`cast(count(${items.id}) filter (where ${itemStates.read} is not true and ${itemStates.muted} is not true) as int)`,
      newestAt:
        sql<Date | null>`max(coalesce(${items.publishedAt}, ${items.createdAt}))`.mapWith(
          (value) => (value ? new Date(value) : null),
        ),
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
    .groupBy(feeds.id, folders.name);

  const byFolder = new Map<string, { count: number; newestAt: Date | null }>();
  let total = 0;
  let newest: Date | null = null;
  const unreadcounts = rows.map((row) => {
    total += row.count;
    if (!newest || (row.newestAt && row.newestAt > newest))
      newest = row.newestAt;
    if (row.folderName) {
      const current = byFolder.get(row.folderName) ?? {
        count: 0,
        newestAt: null,
      };
      current.count += row.count;
      if (
        !current.newestAt ||
        (row.newestAt && row.newestAt > current.newestAt)
      ) {
        current.newestAt = row.newestAt;
      }
      byFolder.set(row.folderName, current);
    }
    return unreadCount(feedStreamId(row.url), row.count, row.newestAt);
  });

  unreadcounts.unshift(unreadCount(GOOGLE_READER_READING_LIST, total, newest));
  for (const [name, count] of byFolder) {
    unreadcounts.push(
      unreadCount(labelStreamId(name), count.count, count.newestAt),
    );
  }
  return { unreadcounts };
}

function unreadCount(id: string, count: number, newestAt: Date | null) {
  return {
    id,
    count,
    newestItemTimestampUsec: newestAt ? toGReaderTimestampUsec(newestAt) : "0",
  };
}

function streamIdFor(stream: GReaderStream): string {
  if (stream.kind === "reading-list") return GOOGLE_READER_READING_LIST;
  if (stream.kind === "read") return GOOGLE_READER_READ;
  if (stream.kind === "starred") return GOOGLE_READER_STARRED;
  if (stream.kind === "feed") return feedStreamId(stream.url);
  return labelStreamId(stream.name);
}

function streamTitle(stream: GReaderStream): string {
  if (stream.kind === "reading-list") return "All items";
  if (stream.kind === "read") return "Read items";
  if (stream.kind === "starred") return "Starred items";
  if (stream.kind === "feed") return stream.url;
  return stream.name;
}

export async function itemIdsForGReaderStream(
  userId: number,
  stream: GReaderStream,
  olderThan: Date | null,
): Promise<number[]> {
  const conditions = await streamConditions(userId, stream);
  const sortAt = sql<Date>`coalesce(${items.publishedAt}, ${items.createdAt})`;
  if (olderThan) conditions.push(sql`${sortAt} < ${olderThan}`);
  const rows = await db
    .select({ id: items.id })
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
    .where(
      and(
        sql`${itemStates.muted} is not true`,
        sql`${itemStates.read} is not true`,
        ...conditions,
      ),
    );
  return rows.map((row) => row.id);
}

async function ownedItemIds(userId: number, ids: number[]): Promise<number[]> {
  const distinct = [...new Set(ids)].slice(0, 1_000);
  if (!distinct.length) return [];
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .where(inArray(items.id, distinct));
  return rows.map((row) => row.id);
}

async function setReadBatch(userId: number, ids: number[], read: boolean) {
  if (read) {
    await setItemsRead(userId, ids);
    return;
  }
  for (const idsChunk of chunk(ids)) {
    await db
      .insert(itemStates)
      .values(
        idsChunk.map((itemId) => ({
          userId,
          itemId,
          read: false,
          readAt: null,
        })),
      )
      .onConflictDoUpdate({
        target: [itemStates.userId, itemStates.itemId],
        set: { read: false, readAt: null },
      });
  }
}

async function setStarredBatch(
  userId: number,
  ids: number[],
  starred: boolean,
) {
  const starredAt = starred ? new Date() : null;
  for (const idsChunk of chunk(ids)) {
    await db
      .insert(itemStates)
      .values(
        idsChunk.map((itemId) => ({ userId, itemId, starred, starredAt })),
      )
      .onConflictDoUpdate({
        target: [itemStates.userId, itemStates.itemId],
        set: { starred, starredAt },
      });
  }
}

async function labelIdForName(
  userId: number,
  rawName: string,
): Promise<number | null> {
  const name = normalizeLabelName(rawName);
  if (!name) return null;
  const existing = await db.query.labels.findFirst({
    columns: { id: true },
    where: and(eq(labels.userId, userId), eq(labels.name, name)),
  });
  if (existing) return existing.id;
  const created = await createLabel(userId, name);
  return created.ok ? created.label.id : null;
}

async function setLabelBatch(
  userId: number,
  ids: number[],
  name: string,
  assigned: boolean,
) {
  const labelId = await labelIdForName(userId, name);
  if (!labelId) return;
  if (assigned) {
    for (const idsChunk of chunk(ids)) {
      await db
        .insert(itemLabels)
        .values(idsChunk.map((itemId) => ({ itemId, labelId })))
        .onConflictDoNothing();
    }
    return;
  }
  await db
    .delete(itemLabels)
    .where(
      and(eq(itemLabels.labelId, labelId), inArray(itemLabels.itemId, ids)),
    );
}

function userLabelName(tag: string): string | null {
  if (isGoogleReaderStateTag(tag)) return null;
  const stream = parseGReaderStream(tag);
  return stream?.kind === "label" ? stream.name : null;
}

/** Applies Google Reader's add/remove tags against one user's subscribed items. */
export async function editGReaderTags(
  userId: number,
  {
    itemIds,
    add,
    remove,
  }: { itemIds: number[]; add: string[]; remove: string[] },
): Promise<number> {
  const ids = await ownedItemIds(userId, itemIds);
  if (!ids.length) return 0;

  if (add.includes(GOOGLE_READER_READ)) await setReadBatch(userId, ids, true);
  if (remove.includes(GOOGLE_READER_READ))
    await setReadBatch(userId, ids, false);
  if (add.includes(GOOGLE_READER_STARRED)) {
    await setStarredBatch(userId, ids, true);
  }
  if (remove.includes(GOOGLE_READER_STARRED)) {
    await setStarredBatch(userId, ids, false);
  }
  for (const tag of add) {
    const name = userLabelName(tag);
    if (name) await setLabelBatch(userId, ids, name, true);
  }
  for (const tag of remove) {
    const name = userLabelName(tag);
    if (name) await setLabelBatch(userId, ids, name, false);
  }
  return ids.length;
}

export async function markGReaderStreamRead(
  userId: number,
  stream: GReaderStream,
  olderThan: Date | null,
): Promise<number> {
  const ids = await itemIdsForGReaderStream(userId, stream, olderThan);
  await setItemsRead(userId, ids);
  return ids.length;
}

export async function quickAddGReaderSubscription(userId: number, url: string) {
  const added = await addFeedForUser(userId, url);
  return {
    numResults: 1,
    query: url,
    streamId: feedStreamId(url),
    title: added.title,
  };
}

async function subscribedFeed(userId: number, url: string) {
  const [row] = await db
    .select({ id: feeds.id })
    .from(feeds)
    .innerJoin(
      subscriptions,
      and(eq(subscriptions.feedId, feeds.id), eq(subscriptions.userId, userId)),
    )
    .where(eq(feeds.url, url));
  return row ?? null;
}

export async function editGReaderSubscription(
  userId: number,
  {
    streamId,
    action,
    title,
    addCategories,
    removeCategories,
  }: {
    streamId: string;
    action: string;
    title: string | null;
    addCategories: string[];
    removeCategories: string[];
  },
): Promise<boolean> {
  const stream = parseGReaderStream(streamId);
  if (stream?.kind !== "feed") return false;
  if (action === "subscribe") {
    await addFeedForUser(userId, stream.url);
    return true;
  }

  const feed = await subscribedFeed(userId, stream.url);
  if (!feed) return false;
  if (action === "unsubscribe") {
    await unsubscribe(userId, feed.id);
    return true;
  }
  if (action !== "edit") return false;

  const category = addCategories
    .map(userLabelName)
    .find((name): name is string => Boolean(name));
  const clearsFolder = removeCategories.some((tag) => userLabelName(tag));
  const folderId = category
    ? await ensureFolder(userId, category)
    : clearsFolder
      ? null
      : undefined;

  await db
    .update(subscriptions)
    .set({
      ...(title !== null ? { customTitle: title.trim() || null } : {}),
      ...(folderId !== undefined ? { folderId } : {}),
    })
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feed.id)),
    );
  return true;
}

export async function deleteGReaderTag(userId: number, streamId: string) {
  const stream = parseGReaderStream(streamId);
  if (stream?.kind !== "label") return false;
  const { folderId, labelId } = await tagTargets(userId, stream.name);
  if (labelId !== null) {
    await db
      .delete(labels)
      .where(and(eq(labels.id, labelId), eq(labels.userId, userId)));
  }
  if (folderId !== null) {
    await db
      .delete(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
  }
  return folderId !== null || labelId !== null;
}

export async function renameGReaderTag(
  userId: number,
  streamId: string,
  destination: string,
) {
  const stream = parseGReaderStream(streamId);
  const next = userLabelName(destination);
  const nextName = next ? normalizeLabelName(next) : null;
  if (stream?.kind !== "label" || !nextName) return false;
  const { folderId, labelId } = await tagTargets(userId, stream.name);
  const [existingFolder, existingLabel] = await Promise.all([
    db.query.folders.findFirst({
      columns: { id: true },
      where: and(eq(folders.userId, userId), eq(folders.name, nextName)),
    }),
    db.query.labels.findFirst({
      columns: { id: true },
      where: and(eq(labels.userId, userId), eq(labels.name, nextName)),
    }),
  ]);
  if (
    (existingFolder && existingFolder.id !== folderId) ||
    (existingLabel && existingLabel.id !== labelId)
  ) {
    return false;
  }
  if (folderId !== null) {
    await db
      .update(folders)
      .set({ name: nextName })
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
  }
  if (labelId !== null) {
    await db
      .update(labels)
      .set({ name: nextName })
      .where(and(eq(labels.id, labelId), eq(labels.userId, userId)));
  }
  return folderId !== null || labelId !== null;
}

export function parseStreamId(value: string): GReaderStream | null {
  return parseGReaderStream(value);
}

export function gReaderStateTag(value: string): boolean {
  return isGoogleReaderStateTag(value);
}
