/**
 * The wire-format vocabulary used by the Google Reader-compatible adapter.
 * Keeping these conversions free of database and Next.js dependencies makes
 * the legacy protocol an edge adapter, rather than part of the reader model.
 */
export const GOOGLE_READER_STATE_PREFIX = "user/-/state/com.google/";
export const GOOGLE_READER_READING_LIST = `${GOOGLE_READER_STATE_PREFIX}reading-list`;
export const GOOGLE_READER_READ = `${GOOGLE_READER_STATE_PREFIX}read`;
export const GOOGLE_READER_STARRED = `${GOOGLE_READER_STATE_PREFIX}starred`;
export const GOOGLE_READER_ITEM_PREFIX = "tag:google.com,2005:reader/item/";

export type GReaderStream =
  | { kind: "reading-list" }
  | { kind: "read" }
  | { kind: "starred" }
  | { kind: "feed"; url: string }
  | { kind: "label"; name: string };

export function feedStreamId(url: string): string {
  return `feed/${url}`;
}

/** Folder and article-label streams share the Google Reader label namespace. */
export function labelStreamId(name: string): string {
  return `user/-/label/${name}`;
}

export function googleReaderItemId(itemId: number): string {
  if (!Number.isSafeInteger(itemId) || itemId < 1) {
    throw new Error("Google Reader item ids must be positive safe integers.");
  }
  return `${GOOGLE_READER_ITEM_PREFIX}${itemId.toString(16).padStart(16, "0")}`;
}

/** Safely turns either an encoded or literal path portion back into a stream id. */
export function decodeGReaderPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseGReaderStream(value: string): GReaderStream | null {
  const stream = decodeGReaderPath(value);
  if (stream === GOOGLE_READER_READING_LIST) return { kind: "reading-list" };
  if (stream === GOOGLE_READER_READ) return { kind: "read" };
  if (stream === GOOGLE_READER_STARRED) return { kind: "starred" };
  if (stream.startsWith("feed/")) {
    const url = stream.slice("feed/".length);
    return url ? { kind: "feed", url } : null;
  }
  if (stream.startsWith("user/-/label/")) {
    const name = stream.slice("user/-/label/".length).trim();
    return name ? { kind: "label", name } : null;
  }
  return null;
}

/** Accept the long canonical id used by native clients, never database ids. */
export function parseGoogleReaderItemId(value: string): number | null {
  const match = value.match(
    /^tag:google\.com,2005:reader\/item\/([0-9a-f]+)$/i,
  );
  if (!match) return null;

  try {
    const id = Number(BigInt(`0x${match[1]}`));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function parseGReaderLimit(value: string | null, fallback = 20): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(1_000, Math.max(1, parsed));
}

export function parseGReaderTimestamp(value: string | null): Date | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const seconds = Number(value);
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toGReaderTimestampUsec(date: Date): string {
  return String(date.getTime() * 1_000);
}

export interface GReaderContinuation {
  sortAt: string;
  itemId: number;
}

export function encodeGReaderContinuation(value: GReaderContinuation): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeGReaderContinuation(
  value: string | null,
): GReaderContinuation | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed?.sortAt !== "string" ||
      Number.isNaN(new Date(parsed.sortAt).getTime()) ||
      !Number.isSafeInteger(parsed?.itemId) ||
      parsed.itemId < 1
    ) {
      return null;
    }
    return { sortAt: parsed.sortAt, itemId: parsed.itemId };
  } catch {
    return null;
  }
}

export function isGoogleReaderStateTag(value: string): boolean {
  return (
    value === GOOGLE_READER_READING_LIST ||
    value === GOOGLE_READER_READ ||
    value === GOOGLE_READER_STARRED
  );
}
