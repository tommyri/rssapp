import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { ensureFeed } from "@/lib/feeds";
import { ensureFolder } from "@/lib/subscriptions";
import { parseOpml } from "./parse";

export interface OpmlImportSummary {
  total: number;
  added: number;
  alreadySubscribed: number;
  folders: number;
}

/**
 * Import an OPML document: create any named folders, ensure each feed exists,
 * and subscribe the user. Feeds are not fetched here — the scheduler pulls their
 * content since new feeds are immediately due.
 */
export async function importOpmlForUser(
  userId: number,
  xml: string,
): Promise<OpmlImportSummary> {
  const entries = parseOpml(xml);
  const folderCache = new Map<string, number>();
  let added = 0;
  let alreadySubscribed = 0;

  for (const entry of entries) {
    const folderId = entry.folderName
      ? await ensureFolder(userId, entry.folderName, folderCache)
      : null;
    const feedId = await ensureFeed(entry.xmlUrl, entry.title);

    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, feedId, folderId })
      .onConflictDoNothing({
        target: [subscriptions.userId, subscriptions.feedId],
      })
      .returning({ id: subscriptions.id });

    if (sub) added += 1;
    else alreadySubscribed += 1;
  }

  return {
    total: entries.length,
    added,
    alreadySubscribed,
    folders: folderCache.size,
  };
}
