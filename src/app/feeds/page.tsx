import { BackLink } from "@/components/back-link";
import { ManagedFeedRow } from "@/components/managed-feed-row";
import { getCurrentUserId } from "@/lib/current-user";
import {
  listFolders,
  listManagedFeeds,
  type ManagedFeed,
  SILENT_AFTER_DAYS,
} from "@/lib/reader";

export default async function ManageFeedsPage() {
  const userId = await getCurrentUserId();
  const [feeds, folderNames] = await Promise.all([
    listManagedFeeds(userId),
    listFolders(userId),
  ]);

  // Silent = fetching fine, just nothing new in a long time (feed health):
  // the site stopped publishing, or the feed moved and this URL is a husk.
  const silentCutoff = Date.now() - SILENT_AFTER_DAYS * 86_400_000;
  const isQuiet = (feed: ManagedFeed) =>
    !feed.paused &&
    !feed.lastError &&
    feed.latestItemAt !== null &&
    feed.latestItemAt.getTime() < silentCutoff;

  // Group under folder headers (listManagedFeeds orders folders first, then
  // title), mirroring the sidebar's scanning rhythm; folderless feeds go last.
  const groups: { name: string | null; feeds: ManagedFeed[] }[] = [];
  for (const feed of feeds) {
    const last = groups.at(-1);
    if (last && last.name === feed.folderName) last.feeds.push(feed);
    else groups.push({ name: feed.folderName, feeds: [feed] });
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          Manage feeds
        </h1>
        <BackLink />
      </div>

      <datalist id="folder-names">
        {folderNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {feeds.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          You have no subscriptions. Add feeds from the reader.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.name ?? "(none)"}>
              {group.name || groups.length > 1 ? (
                <h2 className="px-1 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {group.name ?? "Feeds"}
                </h2>
              ) : null}
              <ul>
                {group.feeds.map((feed) => (
                  <ManagedFeedRow
                    key={feed.feedId}
                    feed={feed}
                    quiet={isQuiet(feed)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
