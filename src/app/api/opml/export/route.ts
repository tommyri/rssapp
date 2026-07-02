import { getCurrentUserId } from "@/lib/current-user";
import { generateOpml } from "@/lib/opml";
import { subscriptionsForExport } from "@/lib/reader";

export async function GET() {
  const userId = await getCurrentUserId();
  const entries = await subscriptionsForExport(userId);
  const xml = generateOpml("rssapp subscriptions", entries);

  return new Response(xml, {
    headers: {
      "content-type": "text/x-opml; charset=utf-8",
      "content-disposition": 'attachment; filename="rssapp-subscriptions.opml"',
    },
  });
}
