import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { sanitizeArticleHtml } from "./sanitize";
import type { ParsedFeed, ParsedItem } from "./types";

const parser = new Parser({
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["dc:creator", "dcCreator"],
    ],
  },
});

function toDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Last-resort dedup key when a feed gives items no guid or link. */
function hashGuid(...parts: (string | null | undefined)[]): string {
  return createHash("sha1")
    .update(parts.filter(Boolean).join("|"))
    .digest("hex");
}

async function parseXml(xml: string): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);
  const items: ParsedItem[] = feed.items.map((item) => {
    const raw = item as typeof item & {
      contentEncoded?: string;
      dcCreator?: string;
    };
    const html = raw.contentEncoded ?? raw.content ?? null;
    return {
      guid: item.guid ?? item.link ?? hashGuid(item.title, item.isoDate, html),
      url: item.link ?? null,
      title: item.title ?? null,
      author: raw.dcCreator ?? item.creator ?? null,
      contentHtml: html ? sanitizeArticleHtml(html) : null,
      publishedAt: toDate(item.isoDate ?? item.pubDate),
    };
  });

  return {
    title: feed.title ?? null,
    siteUrl: feed.link ?? null,
    description: feed.description ?? null,
    items,
  };
}

// Minimal JSON Feed (https://jsonfeed.org) support — rss-parser is XML only.
interface JsonFeedItem {
  id?: string;
  url?: string;
  title?: string;
  content_html?: string;
  content_text?: string;
  date_published?: string;
  author?: { name?: string };
  authors?: { name?: string }[];
}
interface JsonFeedDoc {
  title?: string;
  home_page_url?: string;
  description?: string;
  items?: JsonFeedItem[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseJsonFeed(body: string): ParsedFeed {
  const doc = JSON.parse(body) as JsonFeedDoc;
  const items: ParsedItem[] = (doc.items ?? []).map((item) => {
    const html =
      item.content_html ??
      (item.content_text ? `<p>${escapeHtml(item.content_text)}</p>` : null);
    return {
      guid:
        item.id ?? item.url ?? hashGuid(item.title, item.date_published, html),
      url: item.url ?? null,
      title: item.title ?? null,
      author: item.author?.name ?? item.authors?.[0]?.name ?? null,
      contentHtml: html ? sanitizeArticleHtml(html) : null,
      publishedAt: toDate(item.date_published),
    };
  });

  return {
    title: doc.title ?? null,
    siteUrl: doc.home_page_url ?? null,
    description: doc.description ?? null,
    items,
  };
}

function looksLikeJson(body: string, contentType: string | null): boolean {
  if (contentType?.includes("json")) return true;
  return body.trimStart().startsWith("{");
}

export async function parseFeed(
  body: string,
  contentType: string | null,
): Promise<ParsedFeed> {
  return looksLikeJson(body, contentType)
    ? parseJsonFeed(body)
    : parseXml(body);
}
