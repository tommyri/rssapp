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
}

export function ArticleList({
  initialItems,
  initialHasMore,
  view,
  title,
  toggleHref,
  showingAll,
  isSearch = false,
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
    <div className="space-y-3">
      {/* View header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {isSearch ? (
          <Link
            href="/"
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            ✕ Clear search
          </Link>
        ) : null}
        {!view.starred && !isSearch ? (
          <Link
            href={toggleHref}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            {showingAll ? "Unread only" : "Show read"}
          </Link>
        ) : null}
        {!isSearch ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={scrollMark}
              onChange={toggleScrollMark}
            />
            Mark read on scroll
          </label>
        ) : null}
        {!view.starred && !isSearch ? (
          <MarkAllControl onMark={markAll} statusMsg={statusMsg} />
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {isSearch
            ? "No matching articles. Try fewer or different words — quotes for phrases, - to exclude."
            : view.starred
              ? "No starred articles yet — star something worth keeping."
              : showingAll
                ? "Nothing here yet — try refreshing."
                : "All caught up. 🎉"}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border">
          {items.map((item) => {
            const isOpen = expanded.has(item.id);
            const contentHtml = item.fullContentHtml ?? item.contentHtml;
            const error = fullContentErrors.get(item.id);
            return (
              <li key={item.id} ref={(el) => registerRow(el, item.id)}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(item)}
                  className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left hover:bg-muted/50"
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      item.read ? "bg-transparent" : "bg-sky-500"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-medium ${
                        item.read ? "text-muted-foreground" : ""
                      }`}
                    >
                      {item.starred ? "★ " : ""}
                      {item.title ?? "(untitled)"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {item.feedTitle}
                      {item.publishedAt
                        ? ` · ${relativeTime(new Date(item.publishedAt))}`
                        : ""}
                      {item.author ? ` · ${item.author}` : ""}
                    </span>
                  </span>
                </button>

                {isOpen ? (
                  <div className="space-y-3 px-4 pb-4 pl-9">
                    {item.fullContentHtml ? (
                      <p className="text-xs text-muted-foreground italic">
                        Showing full content from the original page.
                      </p>
                    ) : null}
                    {contentHtml ? (
                      <div
                        className="article-content max-w-prose text-sm"
                        // Sanitized at ingest/extraction (src/lib/feeds/sanitize.ts).
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized before storage
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No content in this feed entry.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {!item.fullContentHtml && item.url ? (
                        <button
                          type="button"
                          disabled={loadingContent.has(item.id)}
                          onClick={() => loadFullContent(item)}
                          className="text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                        >
                          {loadingContent.has(item.id)
                            ? "Loading…"
                            : "Load full content"}
                        </button>
                      ) : null}
                      {error ? (
                        <span className="text-xs text-destructive">
                          {error}
                        </span>
                      ) : null}
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline"
                        >
                          Open original ↗
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => toggleStarred(item)}
                        className="text-muted-foreground underline hover:text-foreground"
                      >
                        {item.starred ? "★ Unstar" : "☆ Star"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleRead(item)}
                        className="text-muted-foreground underline hover:text-foreground"
                      >
                        {item.read ? "Mark unread" : "Mark read"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <div className="flex justify-center py-2">
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
      {statusMsg ? (
        <span className="text-xs text-muted-foreground">{statusMsg}</span>
      ) : null}
      <select
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        aria-label="Mark all read scope"
        className="border-input h-7 rounded-md border bg-transparent px-1.5 text-xs shadow-xs"
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
