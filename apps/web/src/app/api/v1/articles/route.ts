import { listApiArticles } from "@/lib/api-v1";
import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiArticleListQuery } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const query = parseApiArticleListQuery(new URL(request.url).searchParams);
  if (!query) {
    return apiError(
      "invalid_query",
      "Use a limit from 1 to 100, valid boolean filters, and a cursor returned by this endpoint.",
      400,
    );
  }

  return apiJson(await listApiArticles(principal.id, query));
}
