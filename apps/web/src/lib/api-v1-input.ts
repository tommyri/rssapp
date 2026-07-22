import { z } from "zod";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const MAX_CURSOR_LENGTH = 512;

export interface ApiArticleCursor {
  sortAt: Date;
  articleId: number;
}

export interface ApiArticleListQuery {
  limit: number;
  cursor: ApiArticleCursor | null;
  unreadOnly: boolean;
  subscriptionId: number | null;
}

const opaqueId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

const readStateBody = z
  .object({
    articleIds: z.array(opaqueId).min(1).max(100),
    read: z.boolean(),
  })
  .strict();

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

export function parseApiArticleListQuery(
  searchParams: URLSearchParams,
): ApiArticleListQuery | null {
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit
    ? positiveInteger(rawLimit, MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;
  if (limit === null) return null;

  const rawUnreadOnly = searchParams.get("unreadOnly");
  if (
    rawUnreadOnly !== null &&
    rawUnreadOnly !== "true" &&
    rawUnreadOnly !== "false"
  ) {
    return null;
  }

  const rawSubscriptionId = searchParams.get("subscriptionId");
  const subscriptionId = rawSubscriptionId
    ? positiveInteger(rawSubscriptionId)
    : null;
  if (rawSubscriptionId && subscriptionId === null) return null;

  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodeApiArticleCursor(rawCursor) : null;
  if (rawCursor && cursor === null) return null;

  return {
    limit,
    cursor,
    unreadOnly: rawUnreadOnly === "true",
    subscriptionId,
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
