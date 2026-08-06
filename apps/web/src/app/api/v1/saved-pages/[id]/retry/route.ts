import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiOpaqueId } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";
import { retryApiSavedPage } from "@/lib/api-v1-saved-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A deliberate retry, which is a different thing from the automatic ones: it
 * clears the attempt budget and any backoff first, so a page that gave up hours
 * ago genuinely tries again. Unlike saving, this waits for the outcome — the
 * reader tapped Retry and is watching — so the response carries the page's new
 * extraction status rather than leaving the client to poll.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/saved-pages/[id]/retry">,
) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const id = parseApiOpaqueId((await context.params).id);
  if (id === null) {
    return apiError("invalid_request", "That is not a saved page id.", 400);
  }

  const page = await retryApiSavedPage(principal.id, id);
  if (!page) {
    return apiError(
      "saved_page_not_found",
      "That saved page is not available to this account.",
      404,
    );
  }

  return apiJson({ data: { savedPage: page } });
}
