"use client";

import { MoonIcon, PauseIcon, PlayIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import {
  setFeedPausedAction,
  unsubscribeAction,
  updateFeedAction,
} from "@/app/feeds/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { FeedIcon } from "@/components/feed-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/format";
import type { ManagedFeed } from "@/lib/reader";

function fetchedLabel(date: Date | null): string {
  if (!date) return "never";
  const rel = relativeTime(date);
  return rel === "just now" ? rel : `${rel} ago`;
}

const quietActionClass =
  "rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground";

/**
 * One feed on the Manage feeds page (docs/design-ux.md): a compact two-line
 * row — title with status badges, then vitals with non-default settings as
 * chips — and the edit form disclosed on demand. Read by default, edit on
 * request: scanning health is what the page is for; editing is the exception.
 */
export function ManagedFeedRow({
  feed,
  quiet,
}: {
  feed: ManagedFeed;
  /** Fetching fine but nothing new in SILENT_AFTER_DAYS (computed server-side). */
  quiet: boolean;
}) {
  const [editing, setEditing] = useState(false);

  // Only non-default settings earn a chip — a default-configured feed shows none.
  const chips: string[] = [];
  if (feed.fullContent) chips.push("full content");
  if (feed.sortOrder === "oldest") chips.push("oldest first");
  if (!feed.defaultUnreadOnly) chips.push("shows all");
  if (feed.autoReadDays) chips.push(`auto-read ${feed.autoReadDays}d`);

  return (
    <li className="border-b border-border/60 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <FeedIcon siteUrl={feed.siteUrl} feedUrl={feed.url} />
        <span className="min-w-0 flex-shrink truncate text-sm font-medium">
          {feed.title ?? feed.url}
        </span>

        {feed.paused ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
            <PauseIcon className="size-3" />
            paused
          </span>
        ) : null}
        {quiet && feed.latestItemAt ? (
          <span
            title={`Fetching works, but the newest article is ${relativeTime(feed.latestItemAt)} old — the site may have stopped publishing or moved its feed.`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            <MoonIcon className="size-3" />
            quiet · {relativeTime(feed.latestItemAt)}
          </span>
        ) : null}
        {feed.lastError ? (
          <span
            title={feed.lastError}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive"
          >
            <TriangleAlertIcon className="size-3" />
            failing ×{feed.consecutiveFailures}
          </span>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={quietActionClass}
          >
            {editing ? "Close" : "Edit"}
          </button>
          <form action={setFeedPausedAction}>
            <input type="hidden" name="feedId" value={feed.feedId} />
            <input
              type="hidden"
              name="paused"
              value={feed.paused ? "0" : "1"}
            />
            <button
              type="submit"
              title={feed.paused ? "Resume fetching" : "Pause fetching"}
              className={quietActionClass}
            >
              {feed.paused ? (
                <PlayIcon className="size-3.5" />
              ) : (
                <PauseIcon className="size-3.5" />
              )}
              <span className="sr-only">
                {feed.paused ? "Resume fetching" : "Pause fetching"}
              </span>
            </button>
          </form>
        </div>
      </div>

      <div className="mt-1 ml-[26px] flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {feed.unread} unread of {feed.itemCount}
        </span>
        <span>· fetched {fetchedLabel(feed.lastFetchedAt)}</span>
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-border/60 px-2 py-px text-[11px]"
          >
            {chip}
          </span>
        ))}
      </div>

      {editing ? (
        <div className="mt-3 ml-[26px] space-y-3 rounded-lg border border-border/70 p-3">
          <a
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs break-all text-muted-foreground underline"
          >
            {feed.url}
          </a>

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
            <div className="space-y-1 text-xs text-muted-foreground">
              <label className="block" htmlFor={`sort-${feed.feedId}`}>
                Sort
              </label>
              <select
                id={`sort-${feed.feedId}`}
                name="sortOrder"
                defaultValue={feed.sortOrder}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <label className="block" htmlFor={`autoread-${feed.feedId}`}>
                Auto-read after (days)
              </label>
              <Input
                id={`autoread-${feed.feedId}`}
                name="autoReadDays"
                type="number"
                min={1}
                max={365}
                defaultValue={feed.autoReadDays ?? ""}
                placeholder="default"
                className="h-8 w-24"
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
            <label className="flex h-8 items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                name="defaultUnreadOnly"
                defaultChecked={feed.defaultUnreadOnly}
              />
              Unread only by default
            </label>
            <Button type="submit" variant="outline" size="sm">
              Save
            </Button>
          </form>

          <form
            action={unsubscribeAction}
            className="border-t border-border/60 pt-3"
          >
            <input type="hidden" name="feedId" value={feed.feedId} />
            <ConfirmButton
              message={`Unsubscribe from “${feed.title ?? feed.url}”? Its stored articles will be removed.`}
            >
              Unsubscribe
            </ConfirmButton>
          </form>
        </div>
      ) : null}
    </li>
  );
}
