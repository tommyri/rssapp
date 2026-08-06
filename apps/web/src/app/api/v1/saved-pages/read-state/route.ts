import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiSavedPageReadStateBody } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";
import { setApiSavedPageReadState } from "@/lib/api-v1-saved-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saved pages carry their own read flag on their own row, so the unified Read
 * later queue needs this alongside `/articles/read-state` rather than instead
 * of it: one queue, two id spaces, the same verb.
 */
export async function PATCH(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const json = await request.json().catch(() => null);
  const body = parseApiSavedPageReadStateBody(json);
  if (!body) {
    return apiError(
      "invalid_body",
      "Provide 1 to 100 savedPageIds as strings and a boolean read value.",
      400,
    );
  }

  const updatedIds = await setApiSavedPageReadState(
    principal.id,
    body.savedPageIds,
    body.read,
  );
  if (!updatedIds) {
    return apiError(
      "saved_page_not_found",
      "One or more saved pages are not available to this account.",
      404,
    );
  }

  return apiJson({
    data: { savedPageIds: updatedIds.map(String), read: body.read },
  });
}
