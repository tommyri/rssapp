import { markApiArticlesRead } from "@/lib/api-v1";
import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiMarkAllReadBody } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const json = await request.json().catch(() => null);
  const body = parseApiMarkAllReadBody(json);
  if (!body) {
    return apiError(
      "invalid_body",
      'Provide scope "all", or "subscription" with a subscriptionId, or "folder" with a folderId, plus an optional ISO-8601 olderThan.',
      400,
    );
  }

  const markedCount = await markApiArticlesRead(principal.id, body);
  if (markedCount === null) {
    return apiError(
      "scope_not_found",
      body.scope === "folder"
        ? "That folder is not available to this account."
        : "That subscription is not available to this account.",
      404,
    );
  }

  return apiJson({
    data: {
      scope: body.scope,
      subscriptionId:
        body.subscriptionId === null ? null : String(body.subscriptionId),
      folderId: body.folderId === null ? null : String(body.folderId),
      olderThan: body.olderThan?.toISOString() ?? null,
      markedCount,
    },
  });
}
