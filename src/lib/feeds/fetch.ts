import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const USER_AGENT =
  "rssapp/0.1 (+https://github.com/rssapp; self-hosted feed reader)";

const TIMEOUT_MS = 15_000;
const ARTICLE_MAX_BYTES = 5 * 1024 * 1024;
const ARTICLE_MAX_REDIRECTS = 5;

export type FetchResult =
  | {
      status: "ok";
      body: string;
      contentType: string | null;
      etag: string | null;
      lastModified: string | null;
      /** The final URL after guarded article redirects. */
      finalUrl?: string;
    }
  | { status: "not-modified" }
  | {
      status: "error";
      httpStatus?: number;
      error: string;
      retryable?: boolean;
      retryAfterAt?: Date;
    };

interface ConditionalHeaders {
  etag?: string | null;
  lastModified?: string | null;
}

function fetchHeaders(conditional: ConditionalHeaders = {}) {
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept:
      "application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
    "accept-encoding": "gzip, deflate, br",
  };
  if (conditional.etag) headers["if-none-match"] = conditional.etag;
  if (conditional.lastModified)
    headers["if-modified-since"] = conditional.lastModified;
  return headers;
}

function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): Date | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(now + Math.ceil(seconds * 1000));
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now
    ? new Date(timestamp)
    : undefined;
}

function errorFromResponse(
  res: Response,
): Extract<FetchResult, { status: "error" }> {
  return {
    status: "error",
    httpStatus: res.status,
    error: `HTTP ${res.status} ${res.statusText}`,
    retryable: res.status === 429 || res.status >= 500,
    retryAfterAt: parseRetryAfter(res.headers.get("retry-after")),
  };
}

/**
 * Polite HTTP GET for feeds (docs/tech-stack.md): custom UA, gzip, and
 * conditional GET so unchanged feeds cost a 304 instead of a full body.
 */
export async function fetchUrl(
  url: string,
  conditional: ConditionalHeaders = {},
): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: fetchHeaders(conditional),
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { status: "error", error, retryable: true };
  }

  if (res.status === 304) return { status: "not-modified" };
  if (!res.ok) return errorFromResponse(res);

  const body = await res.text();
  return {
    status: "ok",
    body,
    contentType: res.headers.get("content-type"),
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}

function normalizeIp(value: string): string {
  return value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
}

/** Exported for focused SSRF-policy coverage. */
export function isPublicInternetAddress(value: string): boolean {
  const address = normalizeIp(value).toLowerCase();
  const family = isIP(address);
  if (family === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 168)) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
    if (a === 203 && b === 0) return false;
    return true;
  }
  if (family === 6) {
    if (address === "::" || address === "::1") return false;
    // Unique-local, link-local, IPv4-mapped, and documentation ranges are
    // never valid public article origins.
    if (
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      address.startsWith("fe8") ||
      address.startsWith("fe9") ||
      address.startsWith("fea") ||
      address.startsWith("feb") ||
      address.startsWith("::ffff:") ||
      address.startsWith("2001:db8")
    ) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Reject schemes, credentials, ports, and literal private targets before any
 * automatic extraction request leaves the process. Hostname DNS validation is
 * performed separately for every redirect target.
 */
export function articleUrlCandidate(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const hostname = normalizeIp(url.hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    (isIP(hostname) !== 0 && !isPublicInternetAddress(hostname))
  ) {
    return null;
  }
  return url;
}

async function assertPublicArticleTarget(url: URL): Promise<string | null> {
  const hostname = normalizeIp(url.hostname);
  if (isIP(hostname) !== 0) {
    return isPublicInternetAddress(hostname)
      ? null
      : "The article link points to a private network address.";
  }
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (
      addresses.length === 0 ||
      addresses.some((entry) => !isPublicInternetAddress(entry.address))
    ) {
      return "The article link resolves to a private network address.";
    }
    return null;
  } catch {
    return "Could not resolve the article host.";
  }
}

async function boundedText(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > ARTICLE_MAX_BYTES) {
    throw new Error("Article page is too large to extract safely.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > ARTICLE_MAX_BYTES) {
      await reader.cancel();
      throw new Error("Article page is too large to extract safely.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Guarded page fetch for automatic content extraction. Each redirect target is
 * revalidated before it is fetched, and article bodies are size-bounded.
 */
export async function fetchArticleUrl(rawUrl: string): Promise<FetchResult> {
  let current = articleUrlCandidate(rawUrl);
  if (!current) {
    return {
      status: "error",
      error: "Article link is not a safe public HTTP(S) URL.",
    };
  }

  for (let redirects = 0; redirects <= ARTICLE_MAX_REDIRECTS; redirects += 1) {
    const unsafeTarget = await assertPublicArticleTarget(current);
    if (unsafeTarget) return { status: "error", error: unsafeTarget };

    let response: Response;
    try {
      response = await fetch(current, {
        headers: fetchHeaders(),
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { status: "error", error, retryable: true };
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          status: "error",
          error: "Article redirect did not include a destination.",
        };
      }
      const next = articleUrlCandidate(new URL(location, current).toString());
      if (!next) {
        return {
          status: "error",
          error: "Article redirect points to an unsafe destination.",
        };
      }
      current = next;
      continue;
    }
    if (!response.ok) return errorFromResponse(response);

    try {
      return {
        status: "ok",
        body: await boundedText(response),
        contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        finalUrl: current.toString(),
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { status: "error", error };
    }
  }

  return { status: "error", error: "Article redirect chain is too long." };
}
