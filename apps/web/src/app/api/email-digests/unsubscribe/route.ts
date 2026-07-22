import { verifyDigestUnsubscribeToken } from "@/lib/notification-digest-links";
import { disableNotificationDigests } from "@/lib/notification-digests";

function tokenFrom(request: Request): string {
  return new URL(request.url).searchParams.get("token") ?? "";
}

/** Email clients use this RFC 8058 endpoint without an interactive session. */
export async function POST(request: Request): Promise<Response> {
  const entitlement = verifyDigestUnsubscribeToken(tokenFrom(request));
  if (!entitlement) return new Response(null, { status: 400 });
  await disableNotificationDigests(entitlement.userId);
  return new Response(null, { status: 200 });
}

export async function GET(request: Request): Promise<Response> {
  const page = new URL("/email-digests/unsubscribe", request.url);
  page.searchParams.set("token", tokenFrom(request));
  return Response.redirect(page, 307);
}
