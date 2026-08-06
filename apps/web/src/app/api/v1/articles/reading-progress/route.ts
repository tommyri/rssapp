import { setApiArticleReadingProgress } from "@/lib/api-v1";
import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiReadingProgressBody } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where a reader stopped, for resuming later. Batched like the other article
 * mutations so a client returning from the background can flush the positions
 * it buffered in one validated request; one entry is the ordinary case.
 *
 * The response reports what was stored, not what was sent: a fraction near
 * either end of an article is stored as null, because resuming at the very top
 * or the very end is worse than not resuming at all.
 */
export async function PATCH(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const json = await request.json().catch(() => null);
  const body = parseApiReadingProgressBody(json);
  if (!body) {
    return apiError(
      "invalid_body",
      "Provide 1 to 100 distinct articleIds, each with a readingProgress from 0 to 1 or null.",
      400,
    );
  }

  const stored = await setApiArticleReadingProgress(
    principal.id,
    body.positions,
  );
  if (!stored) {
    return apiError(
      "article_not_found",
      "One or more articles are not available to this account.",
      404,
    );
  }

  return apiJson({
    data: {
      positions: stored.map((position) => ({
        articleId: String(position.articleId),
        readingProgress: position.readingProgress,
      })),
    },
  });
}
