import { setApiArticleReadLaterState } from "@/lib/api-v1";
import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiReadLaterStateBody } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const json = await request.json().catch(() => null);
  const body = parseApiReadLaterStateBody(json);
  if (!body) {
    return apiError(
      "invalid_body",
      "Provide 1 to 100 articleIds as strings and a boolean readLater value.",
      400,
    );
  }

  const updatedIds = await setApiArticleReadLaterState(
    principal.id,
    body.articleIds,
    body.readLater,
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
      readLater: body.readLater,
    },
  });
}
