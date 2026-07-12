"use client";

import {
  BookmarkCheckIcon,
  BookmarkIcon,
  CheckIcon,
  CircleIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LinkIcon,
  RotateCwIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClientView,
  fetchItemsAction,
  loadFullContentAction,
  markAllReadAction,
  removeSavedPageAction,
  retrySavedPageAction,
  setItemReadAction,
  setItemReadLaterAction,
  setItemStarredAction,
  setItemsReadAction,
  setSavedPageReadAction,
} from "@/app/actions";
import { ArticleContent } from "@/components/article-content";
import { SaveLinkForm } from "@/components/save-link-form";
import { SwipeableRow } from "@/components/swipeable-row";
import { Button } from "@/components/ui/button";
import { alsoInLabel } from "@/lib/duplicates";
import { relativeTime } from "@/lib/format";
import { shouldIgnoreKeyboard } from "@/lib/keyboard";
import type { ReaderItem } from "@/lib/reader";
import { readingTimeMinutes } from "@/lib/reading-time";

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
  /**
   * Duplicate collapsing is on: the list may already be collapsed server-side,
   * and marking a story read should clear its copies in other feeds too.
   */
  collapse?: boolean;
}

/** Composite key: ids are only unique within a kind (feed item vs saved page). */
const keyOf = (item: Pick<ReaderItem, "kind" | "id">) =>
  `${item.kind}:${item.id}`;

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
  collapse = false,
}: Props) {
  const router = useRouter();
  // Starred / Read later are archive views: no unread filter or mark-all.
  const isArchiveView = Boolean(view.starred || view.readLater);
  const [items, setItems] = useState<ReaderItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  // Only one article is open at a time — opening another closes the previous.
  // Keyed by kind+id since ids collide across kinds in the Read later view.
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
  const itemRowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const expandedIdRef = useRef(expandedId);
  expandedIdRef.current = expandedId;
  const loadingContentRef = useRef(loadingContent);
  loadingContentRef.current = loadingContent;

  useEffect(() => {
    setScrollMark(localStorage.getItem(SCROLL_MARK_KEY) !== "off");
  }, []);

  // Patch entries by composite key so a feed item and a saved page that happen
  // to share a numeric id in the Read later view don't clobber each other.
  const setEntryState = useCallback(
    (keys: string[], patch: Partial<ReaderItem>) => {
      const keySet = new Set(keys);
      setItems((prev) =>
        prev.map((it) => (keySet.has(keyOf(it)) ? { ...it, ...patch } : it)),
      );
    },
    [],
  );

  const flushScrollMarks = useCallback(() => {
    const ids = [...pendingScrollIds.current];
    pendingScrollIds.current.clear();
    if (ids.length === 0) return;
    // Only feed items are scroll-observed, so these are all item ids.
    setEntryState(
      ids.map((id) => `item:${id}`),
      { read: true },
    );
    void setItemsReadAction(ids, collapse).then(() => router.refresh());
  }, [router, setEntryState, collapse]);

  // Scroll-marking: when an unread row leaves the top of the viewport, queue it.
  // Never in search — scanning results must not consume unread state.
  useEffect(() => {
    if (!scrollMark || isSearch) return;
    const unreadIds = new Set(
      items
        .filter(
          (i) =>
            i.kind === "item" && !i.read && !manuallyUnread.current.has(i.id),
        )
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

  // Read state lives in different tables per kind; route to the right action.
  function persistRead(item: ReaderItem, read: boolean) {
    const call =
      item.kind === "page"
        ? setSavedPageReadAction(item.id, read)
        : setItemReadAction(item.id, read, collapse);
    void call.then(() => router.refresh());
  }
  const persistReadRef = useRef(persistRead);
  persistReadRef.current = persistRead;

  function toggleExpanded(item: ReaderItem) {
    const isOpen = expandedId === keyOf(item);
    setExpandedId(isOpen ? null : keyOf(item));
    // Opening an unread article marks it read (docs/features.md MVP).
    if (!isOpen && !item.read) {
      if (item.kind === "item") manuallyUnread.current.delete(item.id);
      setEntryState([keyOf(item)], { read: true });
      persistRead(item, true);
    }
  }

  function toggleRead(item: ReaderItem) {
    const read = !item.read;
    if (!read && item.kind === "item") manuallyUnread.current.add(item.id);
    setEntryState([keyOf(item)], { read });
    persistRead(item, read);
  }

  /**
   * The expanded row's "Mark unread" button: marking unread means "come back
   * to this later", so the article also collapses back to its unread-dot row.
   * Only the button — the `m` key keeps Google Reader semantics (toggle
   * without collapsing), which also preserves the j/k position.
   */
  function toggleReadFromActions(item: ReaderItem) {
    const markingUnread = item.read;
    toggleRead(item);
    if (markingUnread && expandedId === keyOf(item)) setExpandedId(null);
  }

  function toggleStarred(item: ReaderItem) {
    setEntryState([keyOf(item)], { starred: !item.starred });
    void setItemStarredAction(item.id, !item.starred).then(() =>
      router.refresh(),
    );
  }

  function toggleReadLater(item: ReaderItem) {
    setEntryState([keyOf(item)], { readLater: !item.readLater });
    void setItemReadLaterAction(item.id, !item.readLater).then(() =>
      router.refresh(),
    );
  }

  function removePage(item: ReaderItem) {
    setItems((prev) => prev.filter((it) => keyOf(it) !== keyOf(item)));
    if (expandedId === keyOf(item)) setExpandedId(null);
    void removeSavedPageAction(item.id).then(() => router.refresh());
  }

  async function retryPage(item: ReaderItem) {
    setEntryState([keyOf(item)], { pageStatus: "pending", pageError: null });
    const result = await retrySavedPageAction(item.id);
    setEntryState(
      [keyOf(item)],
      result.ok
        ? { pageStatus: "ready", contentHtml: result.html, pageError: null }
        : { pageStatus: "error", pageError: result.error ?? "Failed." },
    );
  }

  async function loadFullContent(item: ReaderItem) {
    setLoadingContent((prev) => new Set(prev).add(item.id));
    try {
      const result = await loadFullContentAction(item.id);
      if (result.ok && result.html) {
        setEntryState([keyOf(item)], { fullContentHtml: result.html });
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
      const page = await fetchItemsAction(
        view,
        { ts: new Date(last.sortTs).toISOString(), id: last.id },
        collapse,
      );
      const known = new Set(items.map((i) => keyOf(i)));
      setItems((prev) => [
        ...prev,
        ...page.items.filter((i) => !known.has(keyOf(i))),
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

  const openItem = useCallback(
    (item: ReaderItem) => {
      setExpandedId(keyOf(item));
      itemRowRefs.current
        .get(keyOf(item))
        ?.scrollIntoView({ block: "nearest" });
      if (!item.read) {
        if (item.kind === "item") manuallyUnread.current.delete(item.id);
        setEntryState([keyOf(item)], { read: true });
        persistReadRef.current(item, true);
      }
    },
    [setEntryState],
  );

  const moveBy = useCallback(
    (delta: number) => {
      const list = itemsRef.current;
      if (list.length === 0) return;
      let idx = list.findIndex((it) => keyOf(it) === expandedIdRef.current);
      if (idx < 0) idx = delta > 0 ? -1 : list.length;
      const next = Math.max(0, Math.min(list.length - 1, idx + delta));
      openItem(list[next]);
    },
    [openItem],
  );

  const smartAdvance = useCallback(() => {
    if (expandedIdRef.current) {
      const remaining =
        document.documentElement.scrollHeight -
        window.scrollY -
        window.innerHeight;
      if (remaining > 48) {
        window.scrollBy({ top: window.innerHeight * 0.85, behavior: "smooth" });
        return;
      }
    }
    const list = itemsRef.current;
    const idx = list.findIndex((it) => keyOf(it) === expandedIdRef.current);
    for (let i = idx + 1; i < list.length; i++) {
      if (!list[i].read) {
        openItem(list[i]);
        return;
      }
    }
    if (idx < list.length - 1) openItem(list[idx + 1]);
  }, [openItem]);

  async function markOlderThanCurrent() {
    const item = itemsRef.current.find(
      (it) => keyOf(it) === expandedIdRef.current,
    );
    if (!item || isSearch || isArchiveView || item.kind !== "item") return;
    const { marked } = await markAllReadAction(
      view,
      null,
      item.sortTs.toISOString(),
    );
    const cutoff = item.sortTs.getTime();
    setItems((prev) =>
      prev.map((it) =>
        it.kind === "item" && new Date(it.sortTs).getTime() < cutoff && !it.read
          ? { ...it, read: true }
          : it,
      ),
    );
    setStatusMsg(`Marked ${marked} read.`);
    router.refresh();
  }

  const keyboardHandlers = useRef({
    toggleRead,
    toggleStarred,
    loadFullContent,
    markAll,
    markOlderThanCurrent,
  });
  keyboardHandlers.current = {
    toggleRead,
    toggleStarred,
    loadFullContent,
    markAll,
    markOlderThanCurrent,
  };

  // Google Reader keyboard canon (design-ux.md) — article-scoped bindings.
  useEffect(() => {
    function currentItem(): ReaderItem | null {
      return (
        itemsRef.current.find((it) => keyOf(it) === expandedIdRef.current) ??
        null
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (shouldIgnoreKeyboard(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (itemsRef.current.length === 0) return;

      const h = keyboardHandlers.current;
      const key = e.key;
      const item = currentItem();

      if (e.shiftKey && key.toLowerCase() === "a") {
        if (isSearch || isArchiveView) return;
        e.preventDefault();
        void h.markAll(null);
        return;
      }

      switch (key) {
        case "j":
          e.preventDefault();
          moveBy(1);
          return;
        case "k":
          e.preventDefault();
          moveBy(-1);
          return;
        case " ":
          e.preventDefault();
          smartAdvance();
          return;
        case "m":
          if (!item) return;
          e.preventDefault();
          h.toggleRead(item);
          return;
        case "s":
          if (!item || item.kind !== "item") return;
          e.preventDefault();
          h.toggleStarred(item);
          return;
        case "v":
          if (!item?.url) return;
          e.preventDefault();
          window.open(item.url, "_blank", "noopener,noreferrer");
          return;
        case "c":
          if (
            !item ||
            item.kind !== "item" ||
            item.fullContentHtml ||
            !item.url ||
            loadingContentRef.current.has(item.id)
          ) {
            return;
          }
          e.preventDefault();
          void h.loadFullContent(item);
          return;
        case "o":
          if (isSearch || isArchiveView) return;
          e.preventDefault();
          void h.markOlderThanCurrent();
          return;
        default:
          return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isArchiveView, isSearch, moveBy, smartAdvance]);

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
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
            >
              <XIcon className="size-3.5" />
              Clear search
            </Link>
          ) : null}
        </div>
        {!isSearch ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {!isArchiveView ? (
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
            {!isArchiveView ? (
              <MarkAllControl onMark={markAll} statusMsg={statusMsg} />
            ) : null}
          </div>
        ) : null}
      </header>

      {view.readLater && !isSearch ? <SaveLinkForm /> : null}

      {items.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-serif text-lg text-muted-foreground italic">
            {isSearch
              ? "No matching articles."
              : view.starred
                ? "Nothing starred yet."
                : view.readLater
                  ? "Nothing saved for later yet."
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
            const key = keyOf(item);
            const isOpen = expandedId === key;
            const isPage = item.kind === "page";
            const contentHtml = item.fullContentHtml ?? item.contentHtml;
            const error = fullContentErrors.get(item.id);
            const snippet = snippetOf(item);
            // Best-available estimate: improves when full content is loaded.
            const minutes = readingTimeMinutes(contentHtml);
            const pageSubtitle =
              isPage && item.pageStatus === "pending"
                ? "Fetching a readable copy…"
                : isPage && item.pageStatus === "error"
                  ? "Couldn't fetch a readable copy — open the original."
                  : "";
            return (
              <li
                key={key}
                ref={(el) => {
                  if (el) itemRowRefs.current.set(key, el);
                  else itemRowRefs.current.delete(key);
                  if (item.kind === "item") registerRow(el, item.id);
                }}
                className={`row-enter border-b border-border/60 ${isOpen ? "border-border" : ""}`}
                style={{
                  animationDelay: `${Math.min(index, STAGGER_CAP) * 30}ms`,
                }}
              >
                {/* Touch: swipe the collapsed header right to toggle read, left
                    to toggle read-later (docs/design-ux.md mobile). Header only
                    — article content needs its own horizontal scrolling. */}
                <SwipeableRow
                  onSwipeRight={() => toggleRead(item)}
                  onSwipeLeft={
                    item.kind === "item"
                      ? () => toggleReadLater(item)
                      : undefined
                  }
                  rightIcon={
                    item.read ? (
                      <CircleIcon className="size-4" />
                    ) : (
                      <CheckIcon className="size-4" />
                    )
                  }
                  leftIcon={
                    item.readLater ? (
                      <BookmarkCheckIcon className="size-4" />
                    ) : (
                      <BookmarkIcon className="size-4" />
                    )
                  }
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
                        className={
                          isOpen
                            ? "block font-serif text-[22px] leading-tight font-bold"
                            : `block truncate text-[15px] leading-snug font-semibold ${
                                item.read ? "text-muted-foreground" : ""
                              }`
                        }
                      >
                        {item.starred ? (
                          <StarIcon className="mr-1 inline-block size-3.5 fill-current align-[-0.15em] text-primary" />
                        ) : null}
                        {isPage ? (
                          <LinkIcon className="mr-1 inline-block size-3.5 align-[-0.15em] text-muted-foreground" />
                        ) : item.readLater ? (
                          <BookmarkCheckIcon className="mr-1 inline-block size-3.5 align-[-0.15em] text-primary" />
                        ) : null}
                        {item.title ?? "(untitled)"}
                      </span>
                      {!isOpen && (pageSubtitle || snippet) ? (
                        <span
                          className={`mt-0.5 line-clamp-2 block text-[13px] leading-normal ${
                            item.read
                              ? "text-muted-foreground/60"
                              : "text-muted-foreground"
                          }`}
                        >
                          {pageSubtitle || snippet}
                        </span>
                      ) : null}
                      <span
                        className={`mt-1 block text-xs text-muted-foreground/80 ${
                          isOpen ? "" : "truncate"
                        }`}
                      >
                        {item.feedTitle}
                        {item.dupFeedTitles && item.dupFeedTitles.length > 0 ? (
                          <span className="text-muted-foreground/70">
                            {` · also in ${alsoInLabel(item.dupFeedTitles)}`}
                          </span>
                        ) : null}
                        {isPage
                          ? ` · saved ${relativeTime(new Date(item.sortTs))}`
                          : item.publishedAt
                            ? ` · ${
                                isOpen
                                  ? new Date(item.publishedAt).toLocaleString()
                                  : relativeTime(new Date(item.publishedAt))
                              }`
                            : ""}
                        {item.author ? ` · ${item.author}` : ""}
                        {/* "N min read" (the Medium convention): no "~" — it
                          doubles up punctuation after the separator dot, and
                          "read" keeps it from scanning as a second timestamp. */}
                        {minutes !== null ? ` · ${minutes} min read` : ""}
                        {isOpen && !isPage && item.fullContentHtml ? (
                          <span className="italic"> · full content</span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </SwipeableRow>

                {isOpen ? (
                  <div className="row-enter pr-1 pb-5 pl-6">
                    {isPage && item.pageStatus === "pending" ? (
                      <p className="text-sm text-muted-foreground italic">
                        Fetching a readable copy — refresh in a moment.
                      </p>
                    ) : isPage && item.pageStatus === "error" ? (
                      <p className="text-sm text-muted-foreground italic">
                        {item.pageError ??
                          "Couldn't fetch a readable copy of this page."}
                      </p>
                    ) : contentHtml ? (
                      <ArticleContent html={contentHtml} />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No content in this feed entry.
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-xs">
                      {item.url ? (
                        <ActionButton asLink href={item.url}>
                          <ExternalLinkIcon className="size-3.5" />
                          Open original
                        </ActionButton>
                      ) : null}
                      {isPage ? (
                        <>
                          {item.pageStatus === "error" ? (
                            <ActionButton onClick={() => retryPage(item)}>
                              <RotateCwIcon className="size-3.5" />
                              Retry
                            </ActionButton>
                          ) : null}
                          <ActionButton
                            onClick={() => toggleReadFromActions(item)}
                          >
                            {item.read ? (
                              <CircleIcon className="size-3.5" />
                            ) : (
                              <CheckIcon className="size-3.5" />
                            )}
                            {item.read ? "Mark unread" : "Mark read"}
                          </ActionButton>
                          <ActionButton onClick={() => removePage(item)}>
                            <Trash2Icon className="size-3.5" />
                            Remove
                          </ActionButton>
                        </>
                      ) : (
                        <>
                          {!item.fullContentHtml && item.url ? (
                            <ActionButton
                              disabled={loadingContent.has(item.id)}
                              onClick={() => loadFullContent(item)}
                            >
                              <FileTextIcon className="size-3.5" />
                              {loadingContent.has(item.id)
                                ? "Loading…"
                                : "Load full content"}
                            </ActionButton>
                          ) : null}
                          <ActionButton onClick={() => toggleStarred(item)}>
                            <StarIcon
                              className={`size-3.5 ${item.starred ? "fill-current text-primary" : ""}`}
                            />
                            {item.starred ? "Unstar" : "Star"}
                          </ActionButton>
                          <ActionButton onClick={() => toggleReadLater(item)}>
                            {item.readLater ? (
                              <BookmarkCheckIcon className="size-3.5 text-primary" />
                            ) : (
                              <BookmarkIcon className="size-3.5" />
                            )}
                            {item.readLater ? "Saved" : "Read later"}
                          </ActionButton>
                          <ActionButton
                            onClick={() => toggleReadFromActions(item)}
                          >
                            {item.read ? (
                              <CircleIcon className="size-3.5" />
                            ) : (
                              <CheckIcon className="size-3.5" />
                            )}
                            {item.read ? "Mark unread" : "Mark read"}
                          </ActionButton>
                          {error ? (
                            <span className="text-destructive">{error}</span>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
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
    "inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground disabled:opacity-50";
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
