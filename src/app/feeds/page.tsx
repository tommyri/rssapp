import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUserId } from "@/lib/current-user";
import { relativeTime } from "@/lib/format";
import { listFolders, listManagedFeeds } from "@/lib/reader";
import { unsubscribeAction, updateFeedAction } from "./actions";

function fetchedLabel(date: Date | null): string {
  if (!date) return "never";
  const rel = relativeTime(date);
  return rel === "just now" ? rel : `${rel} ago`;
}

export default async function ManageFeedsPage() {
  const userId = await getCurrentUserId();
  const [feeds, folderNames] = await Promise.all([
    listManagedFeeds(userId),
    listFolders(userId),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Manage feeds</h1>
        <Link href="/" className="text-sm text-primary underline">
          ← Back to reader
        </Link>
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
        <ul className="space-y-3">
          {feeds.map((feed) => (
            <li key={feed.feedId} className="space-y-3 rounded-lg border p-4">
              <div>
                <div className="font-medium">{feed.title ?? feed.url}</div>
                <a
                  href={feed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs break-all text-muted-foreground underline"
                >
                  {feed.url}
                </a>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{feed.itemCount} articles</span>
                <span>{feed.unread} unread</span>
                <span>fetched {fetchedLabel(feed.lastFetchedAt)}</span>
                {feed.folderName ? <span>📁 {feed.folderName}</span> : null}
                {feed.lastError ? (
                  <span className="text-destructive">
                    ⚠ failing ({feed.consecutiveFailures}×): {feed.lastError}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <form
                  action={updateFeedAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="feedId" value={feed.feedId} />
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <label className="block" htmlFor={`title-${feed.feedId}`}>
                      Title
                    </label>
                    <Input
                      id={`title-${feed.feedId}`}
                      name="title"
                      defaultValue={feed.customTitle ?? ""}
                      placeholder={feed.feedTitle ?? "Feed title"}
                      className="h-8 w-48"
                    />
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <label className="block" htmlFor={`folder-${feed.feedId}`}>
                      Folder
                    </label>
                    <Input
                      id={`folder-${feed.feedId}`}
                      name="folder"
                      list="folder-names"
                      defaultValue={feed.folderName ?? ""}
                      placeholder="None"
                      className="h-8 w-40"
                    />
                  </div>
                  <label className="flex h-8 items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      name="fullContent"
                      defaultChecked={feed.fullContent}
                    />
                    Always load full content
                  </label>
                  <Button type="submit" variant="outline" size="sm">
                    Save
                  </Button>
                </form>

                <form action={unsubscribeAction} className="ml-auto">
                  <input type="hidden" name="feedId" value={feed.feedId} />
                  <ConfirmButton
                    message={`Unsubscribe from “${feed.title ?? feed.url}”? Its stored articles will be removed.`}
                  >
                    Unsubscribe
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
