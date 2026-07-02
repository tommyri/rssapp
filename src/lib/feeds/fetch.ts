export const USER_AGENT =
  "rssapp/0.1 (+https://github.com/rssapp; self-hosted feed reader)";

const TIMEOUT_MS = 15_000;

export type FetchResult =
  | {
      status: "ok";
      body: string;
      contentType: string | null;
      etag: string | null;
      lastModified: string | null;
    }
  | { status: "not-modified" }
  | { status: "error"; httpStatus?: number; error: string };

interface ConditionalHeaders {
  etag?: string | null;
  lastModified?: string | null;
}

/**
 * Polite HTTP GET for feeds (docs/tech-stack.md): custom UA, gzip, and
 * conditional GET so unchanged feeds cost a 304 instead of a full body.
 */
export async function fetchUrl(
  url: string,
  conditional: ConditionalHeaders = {},
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept:
      "application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
    "accept-encoding": "gzip, deflate, br",
  };
  if (conditional.etag) headers["if-none-match"] = conditional.etag;
  if (conditional.lastModified)
    headers["if-modified-since"] = conditional.lastModified;

  let res: Response;
  try {
    res = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { status: "error", error };
  }

  if (res.status === 304) return { status: "not-modified" };
  if (!res.ok) {
    return {
      status: "error",
      httpStatus: res.status,
      error: `HTTP ${res.status} ${res.statusText}`,
    };
  }

  const body = await res.text();
  return {
    status: "ok",
    body,
    contentType: res.headers.get("content-type"),
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}
