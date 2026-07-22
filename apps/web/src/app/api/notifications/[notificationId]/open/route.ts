import { getOptionalUserId } from "@/lib/current-user";
import { markNotificationRead } from "@/lib/notifications";

/** Mark an alert read when its browser push notification is opened. */
export async function POST(
  _request: Request,
  context: RouteContext<"/api/notifications/[notificationId]/open">,
) {
  const userId = await getOptionalUserId();
  if (userId === null) return new Response(null, { status: 401 });

  const { notificationId } = await context.params;
  const id = Number(notificationId);
  if (!Number.isSafeInteger(id) || id < 1) {
    return new Response(null, { status: 400 });
  }

  await markNotificationRead(userId, id);
  return new Response(null, { status: 204 });
}
