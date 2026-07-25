import { getOptionalUserId } from "@/lib/current-user";
import { normalizeStoredArticleHtml } from "@/lib/feeds/sanitize";
import type { SavedPageExtractionSnapshot } from "@/lib/saved-page-extraction";
import { getSavedPage } from "@/lib/saved-pages";

export const runtime = "nodejs";

function noStoreJson(body: object, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/saved-pages/[pageId]/extraction">,
): Promise<Response> {
  const userId = await getOptionalUserId();
  if (userId === null) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId: rawPageId } = await context.params;
  const pageId = Number(rawPageId);
  if (!Number.isSafeInteger(pageId) || pageId < 1) {
    return noStoreJson({ error: "Invalid saved page." }, { status: 400 });
  }

  const page = await getSavedPage(userId, pageId);
  if (!page) {
    return noStoreJson({ error: "Saved page not found." }, { status: 404 });
  }

  let feedTitle = page.siteName;
  if (!feedTitle) {
    try {
      feedTitle = new URL(page.url).hostname.replace(/^www\./, "");
    } catch {
      feedTitle = page.url;
    }
  }
  const snapshot: SavedPageExtractionSnapshot = {
    id: page.id,
    status: page.status,
    error: page.error,
    title: page.title ?? page.url,
    author: page.byline,
    feedTitle,
    contentHtml: normalizeStoredArticleHtml(page.contentHtml, page.url),
  };
  return noStoreJson(snapshot);
}
