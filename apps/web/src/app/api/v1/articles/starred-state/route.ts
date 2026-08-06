import { setApiArticleStarredState } from "@/lib/api-v1";
import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiStarredStateBody } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const json = await request.json().catch(() => null);
  const body = parseApiStarredStateBody(json);
  if (!body) {
    return apiError(
      "invalid_body",
      "Provide 1 to 100 articleIds as strings and a boolean starred value.",
      400,
    );
  }

  const updatedIds = await setApiArticleStarredState(
    principal.id,
    body.articleIds,
    body.starred,
  );
  if (!updatedIds) {
    return apiError(
      "article_not_found",
      "One or more articles are not available to this account.",
      404,
    );
  }

  return apiJson({
    data: {
      articleIds: updatedIds.map(String),
      starred: body.starred,
    },
  });
}
