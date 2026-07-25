import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";
import { getBuildIdentity } from "@/lib/build-identity";

// Publishers see this on every fetch, so it states the real deployed version
// rather than a frozen one. The previous value advertised a repository URL that
// does not exist; a dead link wastes a publisher's time more than no link does.
// Whether to advertise a contact URL here is part of the parked rebrand and
// domain decision (docs/brand-domain-migration.md), not a value to invent.
export const USER_AGENT = `rssapp/${getBuildIdentity().version} (feed reader)`;

const TIMEOUT_MS = 15_000;
const ARTICLE_MAX_BYTES = 5 * 1024 * 1024;
const FEED_MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

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
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    // Reserved blocks inside 192/8 are /24s, apart from RFC 1918's /16. Matching
    // on the second octet alone would take 192.0.0.0/16 with them — 65k public
    // addresses that include WordPress.com and VIP, where a lot of blogs live.
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
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

const ARTICLE_SUBJECT = "The article link";
const FEED_SUBJECT = "The feed address";

/**
 * Reject schemes, credentials, ports, and literal private targets before any
 * automatic request leaves the process. Hostname DNS validation is performed
 * separately for every redirect target.
 *
 * This policy is deliberately uniform for feeds and articles, with no escape
 * hatch: a subscription is a domain name (or, rarely, a public address), so
 * nothing a reader legitimately follows lives on the deployment's own network.
 * A setting that relaxed it would only ever be useful to an attacker.
 */
export function safeFetchCandidate(raw: string): URL | null {
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

async function assertAllowedTarget(
  url: URL,
  subject: string,
): Promise<string | null> {
  const hostname = normalizeIp(url.hostname);
  if (isIP(hostname) !== 0) {
    return isPublicInternetAddress(hostname)
      ? null
      : `${subject} points to a private network address.`;
  }
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (
      addresses.length === 0 ||
      addresses.some((entry) => !isPublicInternetAddress(entry.address))
    ) {
      return `${subject} resolves to a private network address.`;
    }
    return null;
  } catch {
    return `${subject} could not be resolved.`;
  }
}

type LookupResult = { address: string; family: number };
type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  addresses: LookupResult[] | string,
  family?: number,
) => void;

function blocked(message: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(message);
  // Presented to callers as an ordinary connection failure.
  error.code = "ECONNREFUSED";
  return error;
}

/**
 * The authoritative private-address check.
 *
 * `assertAllowedTarget` above resolves the hostname too, but the addresses it
 * approved are not necessarily the ones the socket then connects to: a hostile
 * name can answer a second query with different records, and `fetch` resolves
 * again independently. This runs *inside* the resolution the connection uses,
 * so there is no second lookup left to poison.
 *
 * Both exist deliberately. The pre-flight check produces the message a reader
 * sees for the ordinary mistake of pasting a private URL; this one is the
 * enforcement. Do not delete it as a duplicate.
 */
export function publicOnlyLookup(
  hostname: string,
  options: { all?: boolean },
  callback: LookupCallback,
): void {
  lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      // Any private answer rejects the whole name, matching the pre-flight
      // check — a name that mixes public and private records is not a target
      // we are willing to guess about.
      const usable = addresses.filter((entry) =>
        isPublicInternetAddress(entry.address),
      );
      if (usable.length === 0 || usable.length !== addresses.length) {
        callback(
          blocked(`${hostname} resolves to a private network address.`),
          [],
        );
        return;
      }
      if (options.all) {
        callback(null, usable);
        return;
      }
      const [first] = usable;
      callback(null, first.address, first.family);
    })
    .catch(() => {
      callback(blocked(`${hostname} could not be resolved.`), []);
    });
}

let guardedAgent: Agent | null = null;

/**
 * Built on first use so importing this module never opens sockets, and shared so
 * connections still pool. Every outbound feed and article request goes through
 * it, which is what makes the lookup above unavoidable.
 */
function guardedDispatcher(): Agent {
  guardedAgent ??= new Agent({
    connect: { lookup: publicOnlyLookup, timeout: TIMEOUT_MS },
  });
  return guardedAgent;
}

async function boundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const tooLarge = new Error("The page is too large to fetch safely.");
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw tooLarge;
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * The one guarded outbound GET. Every redirect target is revalidated before it
 * is fetched and bodies are size-bounded, so no automatic request — feed or
 * article — can be steered onto the deployment's own network or made to stream
 * an unbounded response. Callers differ only in how the target is named in
 * errors, conditional headers, and size ceiling.
 */
async function fetchGuarded(
  rawUrl: string,
  subject: string,
  options: { conditional?: ConditionalHeaders; maxBytes: number },
): Promise<FetchResult> {
  let current = safeFetchCandidate(rawUrl);
  if (!current) {
    return {
      status: "error",
      error: `${subject} is not a safe HTTP(S) URL.`,
    };
  }

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const unsafeTarget = await assertAllowedTarget(current, subject);
    if (unsafeTarget) return { status: "error", error: unsafeTarget };

    let response: Response;
    try {
      // `dispatcher` is undici's extension to fetch, so it is absent from the
      // DOM RequestInit type. A variable rather than a literal keeps it out of
      // the excess-property check without casting the whole init away.
      const init: RequestInit & { dispatcher: Agent } = {
        headers: fetchHeaders(options.conditional),
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        dispatcher: guardedDispatcher(),
      };
      response = await fetch(current, init);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { status: "error", error, retryable: true };
    }

    if (response.status === 304) return { status: "not-modified" };

    if (REDIRECT_STATUSES.includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          status: "error",
          error: `${subject} redirected without a destination.`,
        };
      }
      const next = safeFetchCandidate(new URL(location, current).toString());
      if (!next) {
        return {
          status: "error",
          error: `${subject} redirects to an unsafe destination.`,
        };
      }
      current = next;
      continue;
    }
    if (!response.ok) return errorFromResponse(response);

    try {
      return {
        status: "ok",
        body: await boundedText(response, options.maxBytes),
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

  return {
    status: "error",
    error: `${subject} redirect chain is too long.`,
  };
}

/** Guarded page fetch for automatic content extraction. */
export async function fetchArticleUrl(rawUrl: string): Promise<FetchResult> {
  return fetchGuarded(rawUrl, ARTICLE_SUBJECT, {
    maxBytes: ARTICLE_MAX_BYTES,
  });
}

/**
 * Polite HTTP GET for feeds (docs/tech-stack.md): custom UA, gzip, and
 * conditional GET so unchanged feeds cost a 304 instead of a full body.
 */
export async function fetchFeedUrl(
  url: string,
  conditional: ConditionalHeaders = {},
): Promise<FetchResult> {
  return fetchGuarded(url, FEED_SUBJECT, {
    conditional,
    maxBytes: FEED_MAX_BYTES,
  });
}
