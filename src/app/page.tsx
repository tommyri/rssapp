import Link from "next/link";
import { AddFeedForm } from "@/components/add-feed-form";
import { ArticleList } from "@/components/article-list";
import { FeedIcon } from "@/components/feed-icon";
import { OpmlControls } from "@/components/opml-controls";
import { RefreshButton } from "@/components/refresh-button";
import { SearchForm } from "@/components/search-form";
import { StarterFeeds } from "@/components/starter-feeds";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUserId } from "@/lib/current-user";
import {
  type FeedSummary,
  listFeeds,
  listItems,
  searchItems,
} from "@/lib/reader";
import { STARTER_FEEDS } from "@/lib/starter-feeds";
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
    ? `“${query}”`
    : starred
      ? "Starred"
      : feedId
        ? (feeds.find((f) => f.feedId === feedId)?.title ?? "Feed")
        : folderId
          ? (byFolder.get(folderId)?.name ?? "Folder")
          : "All articles";

  const unreadCount = feedId
    ? (feeds.find((f) => f.feedId === feedId)?.unread ?? 0)
    : folderId
      ? (byFolder.get(folderId)?.feeds.reduce((s, f) => s + f.unread, 0) ?? 0)
      : totalUnread;

  return (
    <div className="flex flex-1 flex-col md:h-dvh md:flex-row md:overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:w-72 md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <Link
            href="/"
            className="font-serif text-2xl font-bold tracking-tight"
          >
            rssapp<span className="text-primary">.</span>
          </Link>
          <RefreshButton />
        </div>

        <div className="px-4 pb-4">
          <SearchForm query={query} />
        </div>

        <nav className="flex-1 space-y-0.5 px-2 pb-4">
          <FeedLink
            href="/"
            active={!feedId && !folderId && !starred && !isSearch}
            label="All articles"
            count={totalUnread}
          />
          <FeedLink
            href="/?view=starred"
            active={starred}
            label="Starred"
            marker="★"
            count={0}
          />

          {folderGroups.map(([id, group]) => (
            <div key={id} className="pt-3">
              <Link
                href={`/?folder=${id}`}
                className={`block rounded-md px-2 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors ${
                  folderId === id
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
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
                  icon={<FeedIcon siteUrl={f.siteUrl} feedUrl={f.url} />}
                />
              ))}
            </div>
          ))}

          {ungrouped.length > 0 ? (
            <div className="pt-3">
              {folderGroups.length > 0 ? (
                <div className="px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  Feeds
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
                  icon={<FeedIcon siteUrl={f.siteUrl} feedUrl={f.url} />}
                />
              ))}
            </div>
          ) : null}

          {feeds.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No feeds yet — pick a starter on the right, or add one below.
            </p>
          ) : null}
        </nav>

        <div className="space-y-3 border-t border-sidebar-border px-4 py-4">
          <AddFeedForm />
          <OpmlControls />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            <SidebarUtil href="/feeds" label="Manage" />
            <SidebarUtil href="/rules" label="Rules" />
            <SidebarUtil href="/settings" label="Settings" />
            <ThemeToggle />
            <form action={signOutAction} className="ml-auto">
              <button
                type="submit"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Content pane */}
      <main className="min-w-0 flex-1 md:overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-8">
          {feeds.length === 0 ? (
            <div className="pt-10">
              <StarterFeeds feeds={STARTER_FEEDS} />
            </div>
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
              unreadCount={unreadCount}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function SidebarUtil({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
    </Link>
  );
}

function FeedLink({
  href,
  active,
  label,
  count,
  error,
  icon,
  marker,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  error?: string | null;
  icon?: React.ReactNode;
  marker?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/60"
      }`}
    >
      {marker ? (
        <span aria-hidden className="w-4 text-center text-xs text-primary">
          {marker}
        </span>
      ) : (
        icon
      )}
      {error ? (
        <span title={error} className="shrink-0 text-xs text-destructive">
          ⚠
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 ? (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {count > 1000 ? "1k+" : count}
        </span>
      ) : null}
    </Link>
  );
}
