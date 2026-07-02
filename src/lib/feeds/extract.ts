import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchUrl } from "./fetch";
import { sanitizeArticleHtml } from "./sanitize";

export type ExtractResult =
  | { status: "ok"; html: string }
  | { status: "error"; error: string };

/**
 * Inject a <base href> so the parsed document knows its own URL — Readability
 * resolves relative image/link URLs against it (linkedom has no url option the
 * way JSDOM does).
 */
function withBase(html: string, url: string): string {
  const baseTag = `<base href="${url.replace(/"/g, "&quot;")}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`);
  }
  return `${baseTag}${html}`;
}

/**
 * Fetch an article page and extract its readable content. The result is
 * sanitized with the same pipeline as feed content, so it's safe to store
 * and render directly.
 */
export async function extractFullContent(url: string): Promise<ExtractResult> {
  const res = await fetchUrl(url);
  if (res.status === "error") {
    return { status: "error", error: `Could not fetch page: ${res.error}` };
  }
  if (res.status === "not-modified") {
    return { status: "error", error: "Unexpected 304 from article page" };
  }
  if (res.contentType && !res.contentType.includes("html")) {
    return {
      status: "error",
      error: `Not an HTML page (${res.contentType.split(";")[0]})`,
    };
  }

  try {
    const { document } = parseHTML(withBase(res.body, url));
    const article = new Readability(document, {
      // Feeds link to plenty of short posts; the 500-char default is too strict.
      charThreshold: 250,
    }).parse();

    if (!article?.content) {
      return {
        status: "error",
        error: "Could not find readable content on the page.",
      };
    }
    return { status: "ok", html: sanitizeArticleHtml(article.content) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { status: "error", error: `Extraction failed: ${error}` };
  }
}
