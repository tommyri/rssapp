import {
  BookmarkIcon,
  PauseIcon,
  StarIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { AddFeedForm } from "@/components/add-feed-form";
import { ArticleList } from "@/components/article-list";
import { FeedIcon } from "@/components/feed-icon";
import { FeedMenu } from "@/components/feed-menu";
import { MobileShell } from "@/components/mobile-shell";
import { ReaderGlobalKeyboard } from "@/components/reader-global-keyboard";
import { RefreshButton } from "@/components/refresh-button";
import { SearchForm } from "@/components/search-form";
import { StarterFeeds } from "@/components/starter-feeds";
import { getCurrentUserId } from "@/lib/current-user";
import {
  type FeedSummary,
  getCollapseDuplicates,
  getEmbedLoadingPreferences,
  listFeeds,
  listItems,
  listReadLater,
  savedCounts,
  searchEverything,
} from "@/lib/reader";
import { STARTER_FEEDS } from "@/lib/starter-feeds";
import {
  effectiveShowingAll,
  toggleShowHref,
} from "@/lib/subscription-settings";
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const feedId = parseId(params.feed);
  const folderId = parseId(params.folder);
  const starred = params.view === "starred";
  const readLater = params.view === "later";
  const query = (params.q ?? "").trim();
  const isSearch = query.length > 0;

  const userId = await getCurrentUserId();
  const [feeds, collapse, embedLoading] = await Promise.all([
    listFeeds(userId),
    getCollapseDuplicates(userId),
    getEmbedLoadingPreferences(userId),
  ]);
  const activeFeed = feedId
    ? feeds.find((f) => f.feedId === feedId)
    : undefined;

  const showingAll = effectiveShowingAll(
    params.show,
    feedId ? (activeFeed?.defaultUnreadOnly ?? true) : undefined,
  );
  // Starred and Read later are archive views — read state doesn't gate them.
  const unreadOnly = !showingAll && !starred && !readLater;
  const sortOrder =
    feedId && !starred && !readLater && !isSearch
      ? (activeFeed?.sortOrder ?? "newest")
      : undefined;

  const view = { feedId, folderId, starred, readLater, unreadOnly, sortOrder };

  const [page, saved] = await Promise.all([
    isSearch
      ? searchEverything(userId, query).then((items) => ({
          items,
          hasMore: false,
        }))
      : readLater
        ? listReadLater(userId)
        : listItems(userId, { ...view, limit: 50, collapse }),
    savedCounts(userId),
  ]);
  const totalUnread = feeds.reduce((sum, f) => sum + f.unread, 0);

  // Read later is a client-owned list that also grows via the save form; folding
  // the saved count into its key remounts it after a save so the new page shows,
  // without remounting other views on every router.refresh().
  const viewKey = `${feedId ?? ""}:${folderId ?? ""}:${starred}:${readLater}:${showingAll}:${sortOrder ?? ""}:${query}${
    readLater && !isSearch ? `:${saved.readLater}` : ""
  }`;

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
  const folderNames = folderGroups.map(([, g]) => g.name);

  const title = isSearch
    ? `“${query}”`
    : starred
      ? "Starred"
      : readLater
        ? "Read later"
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
    // App shell: fixed viewport height, chrome stays put, only the content pane
    // scrolls. On mobile the sidebar is a drawer (MobileShell) and a top bar sits
    // above the list; at md+ MobileShell renders the same nav as a static column.
    <div
      data-reader-shell
      className="flex h-dvh flex-col overflow-hidden md:flex-row"
    >
      <MobileShell>
        {/* Brand + refresh: desktop only — on mobile these live in the top bar. */}
        <div className="hidden items-center justify-between px-4 pt-5 pb-3 md:flex">
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
            active={!feedId && !folderId && !starred && !readLater && !isSearch}
            label="All articles"
            count={totalUnread}
          />
          <FeedLink
            href="/?view=starred"
            active={starred}
            label="Starred"
            marker={<StarIcon className="size-4" />}
            count={saved.starred}
          />
          <FeedLink
            href="/?view=later"
            active={readLater}
            label="Read later"
            marker={<BookmarkIcon className="size-4" />}
            count={saved.readLater}
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
                  paused={f.paused}
                  icon={<FeedIcon siteUrl={f.siteUrl} feedUrl={f.url} />}
                  menu={<FeedMenu feed={f} folderNames={folderNames} />}
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
                  paused={f.paused}
                  icon={<FeedIcon siteUrl={f.siteUrl} feedUrl={f.url} />}
                  menu={<FeedMenu feed={f} folderNames={folderNames} />}
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
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5">
              <SidebarUtil href="/feeds" label="Manage" />
              <SidebarUtil href="/rules" label="Rules" />
              <SidebarUtil href="/settings" label="Settings" />
            </div>
            <form action={signOutAction}>
              <button type="submit" className={`${utilButtonClass} w-full`}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </MobileShell>

      {/* Content pane */}
      <main data-reader-scroll className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-8">
          {feeds.length === 0 && !readLater && !isSearch ? (
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
              toggleHref={toggleShowHref(params, activeFeed?.defaultUnreadOnly)}
              showingAll={showingAll}
              isSearch={isSearch}
              unreadCount={unreadCount}
              collapse={collapse}
              embedLoading={embedLoading}
            />
          )}
        </div>
      </main>
      <ReaderGlobalKeyboard />
    </div>
  );
}

const utilButtonClass =
  "block rounded-md border border-border/70 px-2 py-1 text-center text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground";

function SidebarUtil({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={utilButtonClass}>
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
  paused,
  icon,
  marker,
  menu,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  error?: string | null;
  /** Fetching paused (feed health) — shown so a non-updating feed explains itself. */
  paused?: boolean;
  icon?: React.ReactNode;
  marker?: React.ReactNode;
  menu?: React.ReactNode;
}) {
  return (
    <div
      className={`group flex items-center rounded-md transition-colors ${
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/60"
      }`}
    >
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-sm"
      >
        {marker ? (
          <span
            aria-hidden
            className="flex w-4 items-center justify-center text-primary"
          >
            {marker}
          </span>
        ) : (
          icon
        )}
        {error ? (
          <span title={error} className="shrink-0 text-destructive">
            <TriangleAlertIcon className="size-3.5" />
          </span>
        ) : null}
        {paused ? (
          <span
            title="Fetching paused — resume on the Manage feeds page"
            className="shrink-0 text-muted-foreground"
          >
            <PauseIcon className="size-3.5" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {count > 1000 ? "1k+" : count}
          </span>
        ) : null}
      </Link>
      {menu ? <span className="shrink-0 pr-1.5">{menu}</span> : null}
    </div>
  );
}
