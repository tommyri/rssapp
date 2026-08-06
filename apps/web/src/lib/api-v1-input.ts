import { z } from "zod";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const MAX_CURSOR_LENGTH = 512;

export interface ApiArticleCursor {
  sortAt: Date;
  articleId: number;
}

export interface ApiSavedPageCursor {
  savedAt: Date;
  savedPageId: number;
}

/**
 * Which slice of the stream to return. `all` is the default and the behaviour
 * this endpoint has always had; the rest name a single reader view so clients
 * do not have to encode our state model in query flags.
 */
const ARTICLE_FILTERS = ["all", "unread", "starred", "readLater"] as const;

export type ApiArticleFilter = (typeof ARTICLE_FILTERS)[number];

export interface ApiArticleListQuery {
  limit: number;
  cursor: ApiArticleCursor | null;
  filter: ApiArticleFilter;
  subscriptionId: number | null;
  folderId: number | null;
}

/** The scope a bulk read sweep applies to; `all` means every subscription. */
export type ApiMarkAllReadScope = "all" | "subscription" | "folder";

export interface ApiMarkAllReadRequest {
  scope: ApiMarkAllReadScope;
  subscriptionId: number | null;
  folderId: number | null;
  /**
   * Only articles sorted strictly before this instant are swept, matching the
   * web's "mark everything older than this one read" action.
   */
  olderThan: Date | null;
}

const opaqueId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

const articleIdBatch = z.array(opaqueId).min(1).max(100);

/** Accepts an offset or a Z suffix; a bare local timestamp has no defined instant. */
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const readStateBody = z
  .object({
    articleIds: articleIdBatch,
    read: z.boolean(),
  })
  .strict();

const starredStateBody = z
  .object({
    articleIds: articleIdBatch,
    starred: z.boolean(),
  })
  .strict();

const readLaterStateBody = z
  .object({
    articleIds: articleIdBatch,
    readLater: z.boolean(),
  })
  .strict();

const savedPageIdBatch = z.array(opaqueId).min(1).max(100);

/**
 * A resume position, or null for "there is nothing worth resuming". The server
 * decides which of the two a fraction actually is (`storedReadingProgress`), so
 * this only has to reject values that are not fractions at all.
 */
const readingProgressValue = z.number().finite().min(0).max(1).nullable();

const articleProgressBatch = z
  .array(
    z
      .object({ articleId: opaqueId, readingProgress: readingProgressValue })
      .strict(),
  )
  .min(1)
  .max(100);

const savedPageProgressBatch = z
  .array(
    z
      .object({ savedPageId: opaqueId, readingProgress: readingProgressValue })
      .strict(),
  )
  .min(1)
  .max(100);

const readingProgressBody = z
  .object({ positions: articleProgressBatch })
  .strict();

const savedPageReadingProgressBody = z
  .object({ positions: savedPageProgressBatch })
  .strict();

const savedPageReadStateBody = z
  .object({ savedPageIds: savedPageIdBatch, read: z.boolean() })
  .strict();

/**
 * A URL a reader typed or shared. Length-capped because it is stored and later
 * fetched; the scheme, host, and address policy are enforced further in, by
 * `canonicalizeUrl` and the guarded fetch, rather than duplicated here.
 */
const readerSuppliedUrl = z.string().trim().min(1).max(2048);

const savedPageCreateBody = z.object({ url: readerSuppliedUrl }).strict();

const subscriptionCreateBody = z.object({ url: readerSuppliedUrl }).strict();

/**
 * A bulk sweep has to name its scope: an absent scope would make an empty body
 * mean "mark this whole account read", which is not a mistake a client should
 * be able to make by omission.
 */
const markAllReadBody = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("all"), olderThan: instant.optional() }).strict(),
  z
    .object({
      scope: z.literal("subscription"),
      subscriptionId: opaqueId,
      olderThan: instant.optional(),
    })
    .strict(),
  z
    .object({
      scope: z.literal("folder"),
      folderId: opaqueId,
      olderThan: instant.optional(),
    })
    .strict(),
]);

function positiveInteger(
  value: string | null,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
}

export function encodeApiArticleCursor(cursor: ApiArticleCursor): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      sortAt: cursor.sortAt.toISOString(),
      articleId: String(cursor.articleId),
    }),
  ).toString("base64url");
}

export function decodeApiArticleCursor(value: string): ApiArticleCursor | null {
  if (!value || value.length > MAX_CURSOR_LENGTH) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      decoded?.version !== 1 ||
      typeof decoded.sortAt !== "string" ||
      typeof decoded.articleId !== "string"
    ) {
      return null;
    }
    const sortAt = new Date(decoded.sortAt);
    const articleId = positiveInteger(decoded.articleId);
    if (Number.isNaN(sortAt.getTime()) || articleId === null) return null;
    return { sortAt, articleId };
  } catch {
    return null;
  }
}

/**
 * Saved pages page by save time, not publication time, so their cursor carries
 * different keys from an article cursor. Deliberately not interchangeable: a
 * cursor from the wrong stream decodes to null and is rejected as invalid
 * rather than quietly restarting the page.
 */
export function encodeApiSavedPageCursor(cursor: ApiSavedPageCursor): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      savedAt: cursor.savedAt.toISOString(),
      savedPageId: String(cursor.savedPageId),
    }),
  ).toString("base64url");
}

export function decodeApiSavedPageCursor(
  value: string,
): ApiSavedPageCursor | null {
  if (!value || value.length > MAX_CURSOR_LENGTH) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      decoded?.version !== 1 ||
      typeof decoded.savedAt !== "string" ||
      typeof decoded.savedPageId !== "string"
    ) {
      return null;
    }
    const savedAt = new Date(decoded.savedAt);
    const savedPageId = positiveInteger(decoded.savedPageId);
    if (Number.isNaN(savedAt.getTime()) || savedPageId === null) return null;
    return { savedAt, savedPageId };
  } catch {
    return null;
  }
}

function isApiArticleFilter(value: string): value is ApiArticleFilter {
  return (ARTICLE_FILTERS as readonly string[]).includes(value);
}

export function parseApiArticleListQuery(
  searchParams: URLSearchParams,
): ApiArticleListQuery | null {
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit
    ? positiveInteger(rawLimit, MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;
  if (limit === null) return null;

  const rawFilter = searchParams.get("filter");
  if (rawFilter !== null && !isApiArticleFilter(rawFilter)) return null;

  // unreadOnly predates `filter` and stays supported for clients already on it.
  // Contradicting the two is rejected rather than resolved: silently preferring
  // one would hand back a different stream than the client asked for.
  const rawUnreadOnly = searchParams.get("unreadOnly");
  if (
    rawUnreadOnly !== null &&
    rawUnreadOnly !== "true" &&
    rawUnreadOnly !== "false"
  ) {
    return null;
  }
  if (
    rawFilter !== null &&
    rawUnreadOnly !== null &&
    (rawFilter === "unread") !== (rawUnreadOnly === "true")
  ) {
    return null;
  }
  const filter: ApiArticleFilter =
    rawFilter ?? (rawUnreadOnly === "true" ? "unread" : "all");

  const rawSubscriptionId = searchParams.get("subscriptionId");
  const subscriptionId = rawSubscriptionId
    ? positiveInteger(rawSubscriptionId)
    : null;
  if (rawSubscriptionId && subscriptionId === null) return null;

  const rawFolderId = searchParams.get("folderId");
  const folderId = rawFolderId ? positiveInteger(rawFolderId) : null;
  if (rawFolderId && folderId === null) return null;

  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodeApiArticleCursor(rawCursor) : null;
  if (rawCursor && cursor === null) return null;

  return {
    limit,
    cursor,
    filter,
    subscriptionId,
    folderId,
  };
}

export function parseApiReadStateBody(
  value: unknown,
): { articleIds: number[]; read: boolean } | null {
  const parsed = readStateBody.safeParse(value);
  if (!parsed.success) return null;
  return {
    articleIds: [...new Set(parsed.data.articleIds)],
    read: parsed.data.read,
  };
}

export function parseApiStarredStateBody(
  value: unknown,
): { articleIds: number[]; starred: boolean } | null {
  const parsed = starredStateBody.safeParse(value);
  if (!parsed.success) return null;
  return {
    articleIds: [...new Set(parsed.data.articleIds)],
    starred: parsed.data.starred,
  };
}

export function parseApiReadLaterStateBody(
  value: unknown,
): { articleIds: number[]; readLater: boolean } | null {
  const parsed = readLaterStateBody.safeParse(value);
  if (!parsed.success) return null;
  return {
    articleIds: [...new Set(parsed.data.articleIds)],
    readLater: parsed.data.readLater,
  };
}

export interface ApiSavedPageListQuery {
  limit: number;
  cursor: ApiSavedPageCursor | null;
}

export function parseApiSavedPageListQuery(
  searchParams: URLSearchParams,
): ApiSavedPageListQuery | null {
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit
    ? positiveInteger(rawLimit, MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;
  if (limit === null) return null;

  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodeApiSavedPageCursor(rawCursor) : null;
  if (rawCursor && cursor === null) return null;

  return { limit, cursor };
}

/** An opaque id taken from a path segment, e.g. `/saved-pages/{id}`. */
export function parseApiOpaqueId(value: string): number | null {
  return positiveInteger(value);
}

export function parseApiSavedPageCreateBody(
  value: unknown,
): { url: string } | null {
  const parsed = savedPageCreateBody.safeParse(value);
  return parsed.success ? { url: parsed.data.url } : null;
}

export function parseApiSubscriptionCreateBody(
  value: unknown,
): { url: string } | null {
  const parsed = subscriptionCreateBody.safeParse(value);
  return parsed.success ? { url: parsed.data.url } : null;
}

export function parseApiSavedPageReadStateBody(
  value: unknown,
): { savedPageIds: number[]; read: boolean } | null {
  const parsed = savedPageReadStateBody.safeParse(value);
  if (!parsed.success) return null;
  return {
    savedPageIds: [...new Set(parsed.data.savedPageIds)],
    read: parsed.data.read,
  };
}

export interface ApiArticleProgress {
  articleId: number;
  readingProgress: number | null;
}

export interface ApiSavedPageProgress {
  savedPageId: number;
  readingProgress: number | null;
}

/**
 * Unlike the boolean batches, a progress batch carries a different value per
 * id, so a repeated id is a contradiction rather than a duplicate to collapse.
 * Rejecting it is the only answer that cannot silently store the wrong one.
 */
function hasDuplicateIds(ids: number[]): boolean {
  return new Set(ids).size !== ids.length;
}

export function parseApiReadingProgressBody(
  value: unknown,
): { positions: ApiArticleProgress[] } | null {
  const parsed = readingProgressBody.safeParse(value);
  if (!parsed.success) return null;
  const positions = parsed.data.positions;
  if (hasDuplicateIds(positions.map((entry) => entry.articleId))) return null;
  return { positions };
}

export function parseApiSavedPageReadingProgressBody(
  value: unknown,
): { positions: ApiSavedPageProgress[] } | null {
  const parsed = savedPageReadingProgressBody.safeParse(value);
  if (!parsed.success) return null;
  const positions = parsed.data.positions;
  if (hasDuplicateIds(positions.map((entry) => entry.savedPageId))) return null;
  return { positions };
}

export function parseApiMarkAllReadBody(
  value: unknown,
): ApiMarkAllReadRequest | null {
  const parsed = markAllReadBody.safeParse(value);
  if (!parsed.success) return null;
  const body = parsed.data;
  return {
    scope: body.scope,
    subscriptionId: body.scope === "subscription" ? body.subscriptionId : null,
    folderId: body.scope === "folder" ? body.folderId : null,
    olderThan: body.olderThan ?? null,
  };
}
