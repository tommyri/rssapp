import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiSavedPageReadingProgressBody } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";
import { setApiSavedPageReadingProgress } from "@/lib/api-v1-saved-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const json = await request.json().catch(() => null);
  const body = parseApiSavedPageReadingProgressBody(json);
  if (!body) {
    return apiError(
      "invalid_body",
      "Provide 1 to 100 distinct savedPageIds, each with a readingProgress from 0 to 1 or null.",
      400,
    );
  }

  const stored = await setApiSavedPageReadingProgress(
    principal.id,
    body.positions,
  );
  if (!stored) {
    return apiError(
      "saved_page_not_found",
      "One or more saved pages are not available to this account.",
      404,
    );
  }

  return apiJson({
    data: {
      positions: stored.map((position) => ({
        savedPageId: String(position.savedPageId),
        readingProgress: position.readingProgress,
      })),
    },
  });
}
