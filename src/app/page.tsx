import Link from "next/link";
import { AddFeedForm } from "@/components/add-feed-form";
import { ArticleList } from "@/components/article-list";
import { OpmlControls } from "@/components/opml-controls";
import { RefreshButton } from "@/components/refresh-button";
import { SearchForm } from "@/components/search-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUserId } from "@/lib/current-user";
import {
  type FeedSummary,
  listFeeds,
  listItems,
  searchItems,
} from "@/lib/reader";
import { signOutAction } from "./actions";

interface SearchParams {
  feed?: string;
  folder?: string;
  view?: string;
  show?: string;
  q?: string;
}

function parseId(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Build the querystring for the current view with show=all toggled. */
function toggleShowHref(params: SearchParams): string {
  const query = new URLSearchParams();
  if (params.feed) query.set("feed", params.feed);
  if (params.folder) query.set("folder", params.folder);
  if (params.view) query.set("view", params.view);
  if (params.show !== "all") query.set("show", "all");
  const qs = query.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const feedId = parseId(params.feed);
  const folderId = parseId(params.folder);
  const starred = params.view === "starred";
  const showingAll = params.show === "all";
  // Starred is an archive view — read state doesn't gate it.
  const unreadOnly = !showingAll && !starred;

  const query = (params.q ?? "").trim();
  const isSearch = query.length > 0;

  const view = { feedId, folderId, starred, unreadOnly };
  const viewKey = `${feedId ?? ""}:${folderId ?? ""}:${starred}:${showingAll}:${query}`;

  const userId = await getCurrentUserId();
  const [feeds, page] = await Promise.all([
    listFeeds(userId),
    isSearch
      ? searchItems(userId, query).then((items) => ({ items, hasMore: false }))
      : listItems(userId, { ...view, limit: 50 }),
  ]);
  const totalUnread = feeds.reduce((sum, f) => sum + f.unread, 0);

  // Group feeds by folder for the sidebar; feeds without a folder go last.
  const byFolder = new Map<number, { name: string; feeds: FeedSummary[] }>();
  const ungrouped: FeedSummary[] = [];
  for (const f of feeds) {
    if (f.folderId !== null && f.folderName !== null) {
      const group = byFolder.get(f.folderId) ?? {
        name: f.folderName,
        feeds: [],
      };
      group.feeds.push(f);
      byFolder.set(f.folderId, group);
    } else {
      ungrouped.push(f);
    }
  }
  const folderGroups = [...byFolder.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name),
  );

  const title = isSearch
    ? `Search: “${query}”`
    : starred
      ? "Starred"
      : feedId
        ? (feeds.find((f) => f.feedId === feedId)?.title ?? "Feed")
        : folderId
          ? (byFolder.get(folderId)?.name ?? "Folder")
          : "All articles";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
      {/* Sidebar */}
      <aside className="w-full shrink-0 space-y-5 md:w-72">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">rssapp</h1>
          <div className="flex items-center gap-3">
            <RefreshButton />
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <AddFeedForm />
        <OpmlControls />
        <SearchForm query={query} />

        <nav className="space-y-1">
          <FeedLink
            href="/"
            active={!feedId && !folderId && !starred}
            label="All articles"
            count={totalUnread}
          />
          <FeedLink
            href="/?view=starred"
            active={starred}
            label="★ Starred"
            count={0}
          />

          {folderGroups.map(([id, group]) => (
            <div key={id} className="pt-2">
              <Link
                href={`/?folder=${id}`}
                className={`block rounded-md px-2 py-1 text-xs font-medium tracking-wide uppercase ${
                  folderId === id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {group.name}
              </Link>
              {group.feeds.map((f) => (
                <FeedLink
                  key={f.feedId}
                  href={`/?feed=${f.feedId}`}
                  active={feedId === f.feedId}
                  label={f.title ?? f.url}
                  count={f.unread}
                  error={f.lastError}
                />
              ))}
            </div>
          ))}

          {ungrouped.length > 0 ? (
            <div className="pt-2">
              {folderGroups.length > 0 ? (
                <div className="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  No folder
                </div>
              ) : null}
              {ungrouped.map((f) => (
                <FeedLink
                  key={f.feedId}
                  href={`/?feed=${f.feedId}`}
                  active={feedId === f.feedId}
                  label={f.title ?? f.url}
                  count={f.unread}
                  error={f.lastError}
                />
              ))}
            </div>
          ) : null}

          {feeds.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No feeds yet. Paste a feed or site URL above to get started.
            </p>
          ) : null}
        </nav>

        {feeds.length > 0 ? (
          <div className="flex gap-4 px-2">
            <Link
              href="/feeds"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Manage feeds
            </Link>
            <Link
              href="/rules"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Rules
            </Link>
            <ThemeToggle />
          </div>
        ) : null}
      </aside>

      {/* Article list */}
      <main className="min-w-0 flex-1">
        {feeds.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Add a feed to see articles here.
          </p>
        ) : (
          <ArticleList
            key={viewKey}
            initialItems={page.items}
            initialHasMore={page.hasMore}
            view={view}
            title={title}
            toggleHref={toggleShowHref(params)}
            showingAll={showingAll}
            isSearch={isSearch}
          />
        )}
      </main>
    </div>
  );
}

function FeedLink({
  href,
  active,
  label,
  count,
  error,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  error?: string | null;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-muted font-medium" : "hover:bg-muted/50"
      }`}
    >
      {error ? (
        <span title={error} className="shrink-0 text-destructive">
          ⚠
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 ? (
        <span className="shrink-0 rounded-full bg-muted-foreground/15 px-2 py-0.5 text-xs tabular-nums">
          {count > 1000 ? "1k+" : count}
        </span>
      ) : null}
    </Link>
  );
}
