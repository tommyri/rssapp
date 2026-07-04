"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClientView,
  fetchItemsAction,
  loadFullContentAction,
  markAllReadAction,
  setItemReadAction,
  setItemStarredAction,
  setItemsReadAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import type { ReaderItem } from "@/lib/reader";

const SCROLL_MARK_KEY = "rssapp:markReadOnScroll";
const SCROLL_FLUSH_MS = 800;
const STAGGER_CAP = 10;

interface Props {
  initialItems: ReaderItem[];
  initialHasMore: boolean;
  view: ClientView;
  title: string;
  /** Href that toggles between unread-only and show-all for this view. */
  toggleHref: string;
  showingAll: boolean;
  /** Search-results mode: no read filters, no mark-all, no scroll-marking. */
  isSearch?: boolean;
  unreadCount?: number;
}

/** One-line preview derived from the stored (sanitized) HTML. */
function snippetOf(item: ReaderItem): string {
  const html = item.fullContentHtml ?? item.contentHtml ?? "";
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Too short to preview anything (e.g. HN's bare "Comments" link) — skip.
  if (text.length < 40 || text === item.title) return "";
  return text.slice(0, 220);
}

export function ArticleList({
  initialItems,
  initialHasMore,
  view,
  title,
  toggleHref,
  showingAll,
  isSearch = false,
  unreadCount = 0,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ReaderItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [scrollMark, setScrollMark] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [fullContentErrors, setFullContentErrors] = useState<
    Map<number, string>
  >(new Map());
  const [loadingContent, setLoadingContent] = useState<Set<number>>(new Set());

  // Items the user explicitly marked unread — scroll-marking leaves them alone.
  const manuallyUnread = useRef<Set<number>>(new Set());
  const pendingScrollIds = useRef<Set<number>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Map<Element, number>>(new Map());

  useEffect(() => {
    setScrollMark(localStorage.getItem(SCROLL_MARK_KEY) !== "off");
  }, []);

  const setItemState = useCallback(
    (ids: number[], patch: Partial<ReaderItem>) => {
      const idSet = new Set(ids);
      setItems((prev) =>
        prev.map((it) => (idSet.has(it.id) ? { ...it, ...patch } : it)),
      );
    },
    [],
  );

  const flushScrollMarks = useCallback(() => {
    const ids = [...pendingScrollIds.current];
    pendingScrollIds.current.clear();
    if (ids.length === 0) return;
    setItemState(ids, { read: true });
    void setItemsReadAction(ids).then(() => router.refresh());
  }, [router, setItemState]);

  // Scroll-marking: when an unread row leaves the top of the viewport, queue it.
  // Never in search — scanning results must not consume unread state.
  useEffect(() => {
    if (!scrollMark || isSearch) return;
    const unreadIds = new Set(
      items
        .filter((i) => !i.read && !manuallyUnread.current.has(i.id))
        .map((i) => i.id),
    );
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) continue;
        if (entry.boundingClientRect.bottom >= 80) continue; // left via bottom, not top
        const id = rowRefs.current.get(entry.target);
        if (id !== undefined && unreadIds.has(id)) {
          pendingScrollIds.current.add(id);
          if (flushTimer.current) clearTimeout(flushTimer.current);
          flushTimer.current = setTimeout(flushScrollMarks, SCROLL_FLUSH_MS);
        }
      }
    });
    for (const [el, id] of rowRefs.current) {
      if (unreadIds.has(id)) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items, scrollMark, isSearch, flushScrollMarks]);

  function registerRow(el: HTMLLIElement | null, id: number) {
    if (el) rowRefs.current.set(el, id);
    else {
      for (const [k, v] of rowRefs.current) {
        if (v === id) rowRefs.current.delete(k);
      }
    }
  }

  function toggleExpanded(item: ReaderItem) {
    const isOpen = expanded.has(item.id);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
    // Opening an unread article marks it read (docs/features.md MVP).
    if (!isOpen && !item.read) {
      manuallyUnread.current.delete(item.id);
      setItemState([item.id], { read: true });
      void setItemReadAction(item.id, true).then(() => router.refresh());
    }
  }

  function toggleRead(item: ReaderItem) {
    const read = !item.read;
    if (!read) manuallyUnread.current.add(item.id);
    setItemState([item.id], { read });
    void setItemReadAction(item.id, read).then(() => router.refresh());
  }

  function toggleStarred(item: ReaderItem) {
    setItemState([item.id], { starred: !item.starred });
    void setItemStarredAction(item.id, !item.starred).then(() =>
      router.refresh(),
    );
  }

  async function loadFullContent(item: ReaderItem) {
    setLoadingContent((prev) => new Set(prev).add(item.id));
    try {
      const result = await loadFullContentAction(item.id);
      if (result.ok && result.html) {
        setItemState([item.id], { fullContentHtml: result.html });
      } else {
        setFullContentErrors((prev) =>
          new Map(prev).set(item.id, result.error ?? "Extraction failed."),
        );
      }
    } finally {
      setLoadingContent((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function loadOlder() {
    const last = items.at(-1);
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchItemsAction(view, {
        ts: new Date(last.sortTs).toISOString(),
        id: last.id,
      });
      const known = new Set(items.map((i) => i.id));
      setItems((prev) => [
        ...prev,
        ...page.items.filter((i) => !known.has(i.id)),
      ]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function markAll(olderThanDays: number | null) {
    const { marked } = await markAllReadAction(view, olderThanDays);
    const cutoff = olderThanDays
      ? Date.now() - olderThanDays * 86_400_000
      : Number.POSITIVE_INFINITY;
    setItems((prev) =>
      prev.map((it) =>
        new Date(it.sortTs).getTime() < cutoff ? { ...it, read: true } : it,
      ),
    );
    setStatusMsg(`Marked ${marked} read.`);
    router.refresh();
  }

  function toggleScrollMark() {
    const next = !scrollMark;
    setScrollMark(next);
    localStorage.setItem(SCROLL_MARK_KEY, next ? "on" : "off");
  }

  return (
    <div>
      {/* View header */}
      <header className="sticky top-0 z-10 -mx-4 border-b border-border/60 bg-background/85 px-4 pt-6 pb-3 backdrop-blur-sm md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-serif text-2xl font-bold tracking-tight">
            {title}
          </h2>
          {!isSearch && unreadCount > 0 ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {unreadCount > 1000 ? "1k+" : unreadCount} unread
            </span>
          ) : null}
          {isSearch ? (
            <Link
              href="/"
              className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
            >
              ✕ Clear search
            </Link>
          ) : null}
        </div>
        {!isSearch ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {!view.starred ? (
              <Link
                href={toggleHref}
                className="rounded-md border border-border/70 px-2.5 py-1 transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
              >
                {showingAll ? "Unread only" : "Show read"}
              </Link>
            ) : null}
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={scrollMark}
                onChange={toggleScrollMark}
                className="accent-primary"
              />
              Mark read on scroll
            </label>
            {!view.starred ? (
              <MarkAllControl onMark={markAll} statusMsg={statusMsg} />
            ) : null}
          </div>
        ) : null}
      </header>

      {items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-serif text-lg text-muted-foreground italic">
            {isSearch
              ? "No matching articles."
              : view.starred
                ? "Nothing starred yet."
                : showingAll
                  ? "Nothing here yet — try refreshing."
                  : "All caught up."}
          </p>
          {isSearch ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Try fewer or different words — quotes for phrases, - to exclude.
            </p>
          ) : null}
        </div>
      ) : (
        <ul>
          {items.map((item, index) => {
            const isOpen = expanded.has(item.id);
            const contentHtml = item.fullContentHtml ?? item.contentHtml;
            const error = fullContentErrors.get(item.id);
            const snippet = snippetOf(item);
            return (
              <li
                key={item.id}
                ref={(el) => registerRow(el, item.id)}
                className={`row-enter border-b border-border/60 ${isOpen ? "border-border" : ""}`}
                style={{
                  animationDelay: `${Math.min(index, STAGGER_CAP) * 30}ms`,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(item)}
                  className="group flex w-full cursor-pointer items-start gap-3 px-1 py-3.5 text-left transition-colors hover:bg-accent/40"
                >
                  <span
                    aria-hidden
                    className={`mt-[7px] size-2 shrink-0 rounded-full transition-colors ${
                      item.read ? "bg-transparent" : "bg-primary"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[15px] leading-snug font-semibold ${
                        item.read ? "text-muted-foreground" : ""
                      }`}
                    >
                      {item.starred ? (
                        <span className="text-primary">★ </span>
                      ) : null}
                      {item.title ?? "(untitled)"}
                    </span>
                    {!isOpen && snippet ? (
                      <span
                        className={`mt-0.5 line-clamp-2 block text-[13px] leading-normal ${
                          item.read
                            ? "text-muted-foreground/60"
                            : "text-muted-foreground"
                        }`}
                      >
                        {snippet}
                      </span>
                    ) : null}
                    <span className="mt-1 block truncate text-xs text-muted-foreground/80">
                      {item.feedTitle}
                      {item.publishedAt
                        ? ` · ${relativeTime(new Date(item.publishedAt))}`
                        : ""}
                      {item.author ? ` · ${item.author}` : ""}
                    </span>
                  </span>
                </button>

                {isOpen ? (
                  <article className="row-enter mb-4 rounded-lg border border-border/60 bg-card px-5 py-5 md:px-7">
                    <h3 className="font-serif text-[22px] leading-tight font-bold">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="transition-colors hover:text-primary"
                        >
                          {item.title ?? "(untitled)"}
                        </a>
                      ) : (
                        (item.title ?? "(untitled)")
                      )}
                    </h3>
                    <p className="mt-1 mb-4 text-xs text-muted-foreground">
                      {item.feedTitle}
                      {item.author ? ` · ${item.author}` : ""}
                      {item.publishedAt
                        ? ` · ${new Date(item.publishedAt).toLocaleString()}`
                        : ""}
                      {item.fullContentHtml ? (
                        <span className="italic"> · full content</span>
                      ) : null}
                    </p>

                    {contentHtml ? (
                      <div
                        className="article-content max-w-prose"
                        // Sanitized at ingest/extraction (src/lib/feeds/sanitize.ts).
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized before storage
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No content in this feed entry.
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-xs">
                      {item.url ? (
                        <ActionButton asLink href={item.url}>
                          Open original ↗
                        </ActionButton>
                      ) : null}
                      {!item.fullContentHtml && item.url ? (
                        <ActionButton
                          disabled={loadingContent.has(item.id)}
                          onClick={() => loadFullContent(item)}
                        >
                          {loadingContent.has(item.id)
                            ? "Loading…"
                            : "Load full content"}
                        </ActionButton>
                      ) : null}
                      <ActionButton onClick={() => toggleStarred(item)}>
                        {item.starred ? "★ Unstar" : "☆ Star"}
                      </ActionButton>
                      <ActionButton onClick={() => toggleRead(item)}>
                        {item.read ? "Mark unread" : "Mark read"}
                      </ActionButton>
                      {error ? (
                        <span className="text-destructive">{error}</span>
                      ) : null}
                    </div>
                  </article>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <div className="flex justify-center py-6">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={loadOlder}
          >
            {loadingMore ? "Loading…" : "Load older articles"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  asLink,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  asLink?: boolean;
  href?: string;
}) {
  const className =
    "rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground disabled:opacity-50";
  if (asLink && href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}

function MarkAllControl({
  onMark,
  statusMsg,
}: {
  onMark: (olderThanDays: number | null) => Promise<void>;
  statusMsg: string;
}) {
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onMark(scope === "all" ? null : Number(scope));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="ml-auto flex items-center gap-2">
      {statusMsg ? <span>{statusMsg}</span> : null}
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        aria-label="Mark all read scope"
        className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
      >
        <option value="all">everything</option>
        <option value="1">older than a day</option>
        <option value="7">older than a week</option>
      </select>
      <Button variant="outline" size="sm" disabled={busy} onClick={run}>
        {busy ? "Marking…" : "Mark all read"}
      </Button>
    </span>
  );
}
