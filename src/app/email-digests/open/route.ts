import { getOptionalUserId } from "@/lib/current-user";
import { verifyDigestOpenToken } from "@/lib/notification-digest-links";
import { markNotificationRead } from "@/lib/notifications";

function readerUrl(request: Request, notificationId?: number): URL {
  const url = new URL("/", request.url);
  url.searchParams.set("view", "notifications");
  if (notificationId) {
    url.searchParams.set("notification", String(notificationId));
  }
  return url;
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
  const entitlement = verifyDigestOpenToken(token);
  if (!entitlement) {
    return Response.redirect(readerUrl(request), 307);
  }

  const currentUserId = await getOptionalUserId();
  if (!currentUserId) {
    const returnTo = `${requestUrl.pathname}${requestUrl.search}`;
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", returnTo);
    return Response.redirect(login, 307);
  }
  if (currentUserId !== entitlement.userId) {
    return Response.redirect(readerUrl(request), 307);
  }

  const opened = await markNotificationRead(
    currentUserId,
    entitlement.notificationId,
  );
  return Response.redirect(
    readerUrl(request, opened ? entitlement.notificationId : undefined),
    307,
  );
}
