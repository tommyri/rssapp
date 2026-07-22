import { listApiSubscriptions } from "@/lib/api-v1";
import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { apiJson, apiUnauthorized } from "@/lib/api-v1-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();
  return apiJson({ data: await listApiSubscriptions(principal.id) });
}
