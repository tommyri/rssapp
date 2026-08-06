import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiOpaqueId } from "@/lib/api-v1-input";
import { apiError, apiUnauthorized } from "@/lib/api-v1-response";
import { removeApiSavedPage } from "@/lib/api-v1-saved-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remove — the read-later-only verb (docs/design-ux.md). A saved page is in the
 * queue by existing, so there is no flag to clear: deleting it is the whole
 * action, and it is why saved pages have Remove where a flagged article has
 * un-flag.
 */
export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/saved-pages/[id]">,
) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const id = parseApiOpaqueId((await context.params).id);
  if (id === null) {
    return apiError("invalid_request", "That is not a saved page id.", 400);
  }

  const removed = await removeApiSavedPage(principal.id, id);
  if (!removed) {
    return apiError(
      "saved_page_not_found",
      "That saved page is not available to this account.",
      404,
    );
  }

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
