import { listApiSubscriptions } from "@/lib/api-v1";
import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import { parseApiSubscriptionCreateBody } from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";
import { createApiSubscription } from "@/lib/api-v1-subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();
  return apiJson({ data: await listApiSubscriptions(principal.id) });
}

/**
 * Add a source from any URL a reader has: a feed address, a site, or a YouTube
 * channel. Autodiscovery is the web's, so a native add and a web add resolve
 * the same URL to the same feed.
 *
 * Two outcomes are successful and the client tells them apart by `data.status`
 * rather than by the code: `subscribed` carries the new subscription in the
 * shape `GET /subscriptions` returns, and `candidates` carries the feeds a page
 * advertised so the client can ask which one — nothing is subscribed in that
 * case, and answering means POSTing the chosen candidate URL back here.
 */
export async function POST(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const json = await request.json().catch(() => null);
  const body = parseApiSubscriptionCreateBody(json);
  if (!body) {
    return apiError("invalid_body", "Provide a feed or site url.", 400);
  }

  const result = await createApiSubscription(principal.id, body.url);
  if (result.status === "alreadySubscribed") {
    return apiError(
      "already_subscribed",
      "This account already follows that source.",
      409,
    );
  }
  if (result.status === "notFound") {
    return apiError("feed_not_found", result.message, 422);
  }
  if (result.status === "candidates") {
    return apiJson({
      data: { status: "candidates", candidates: result.candidates },
    });
  }

  return apiJson(
    { data: { status: "subscribed", subscription: result.subscription } },
    { status: 201 },
  );
}
