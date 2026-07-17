"use client";

import { HighlighterIcon, PencilIcon, XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { bindArticleAudioProgress } from "@/lib/article-audio-progress";
import type { AudioProgressByUrl } from "@/lib/audio-progress";
import {
  type EmbedLoadingPreferences,
  resolveEmbedLoading,
} from "@/lib/embed-loading";
import {
  deferEmbedsHtml,
  deferredEmbedFromUrl,
} from "@/lib/feeds/deferred-embeds";
import {
  type ArticleHighlight,
  type HighlightAnchor,
  renderableHighlights,
} from "@/lib/highlight-selection";

interface PendingHighlight {
  anchor: HighlightAnchor;
  left: number;
  top: number;
  note: string;
}

interface OpenHighlight {
  id: number;
  left: number;
  top: number;
}

interface HighlightPicker {
  ids: number[];
  left: number;
  top: number;
}

function offsetBefore(
  root: HTMLElement,
  container: Node,
  offset: number,
): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(container, offset);
  return range.toString().length;
}

function selectionAnchor(root: HTMLElement): HighlightAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }
  const commonElement =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  // Code highlighters restructure these nodes asynchronously; prose is the
  // dependable first annotation surface.
  if (commonElement?.closest("pre, code")) return null;

  const quote = range.toString();
  const startOffset = offsetBefore(
    root,
    range.startContainer,
    range.startOffset,
  );
  const endOffset = offsetBefore(root, range.endContainer, range.endOffset);
  const text = root.textContent ?? "";
  return quote.trim().length > 0 && text.slice(startOffset, endOffset) === quote
    ? { quote, startOffset, endOffset }
    : null;
}

function clearRenderedHighlights(root: HTMLElement) {
  for (const mark of root.querySelectorAll("mark[data-reader-highlight]")) {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  }
  root.normalize();
}

function highlightIdsForMark(mark: HTMLElement): number[] {
  const rawIds =
    mark.dataset.readerHighlightIds ?? mark.dataset.readerHighlight ?? "";
  return [
    ...new Set(
      rawIds
        .split(",")
        .map((rawId) => Number(rawId))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

function wrapHighlightSegments(
  root: HTMLElement,
  highlights: ArticleHighlight[],
  focusedHighlightId?: number,
) {
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    nodes.push({
      node: node as Text,
      start: offset,
      end: offset + text.length,
    });
    offset += text.length;
  }

  for (const { node, start, end } of nodes) {
    const boundaries = new Set([0, end - start]);
    let intersectsHighlight = false;
    for (const highlight of highlights) {
      const overlapStart = Math.max(start, highlight.startOffset);
      const overlapEnd = Math.min(end, highlight.endOffset);
      if (overlapStart >= overlapEnd) continue;
      intersectsHighlight = true;
      boundaries.add(overlapStart - start);
      boundaries.add(overlapEnd - start);
    }
    if (!intersectsHighlight) continue;

    const sortedBoundaries = [...boundaries].sort(
      (left, right) => left - right,
    );
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
      const localStart = sortedBoundaries[index];
      const localEnd = sortedBoundaries[index + 1];
      if (localStart === localEnd) continue;
      const segmentStart = start + localStart;
      const segmentEnd = start + localEnd;
      const activeHighlights = highlights.filter(
        (highlight) =>
          highlight.startOffset <= segmentStart &&
          highlight.endOffset >= segmentEnd,
      );
      const segment = document.createTextNode(
        node.data.slice(localStart, localEnd),
      );
      if (activeHighlights.length === 0) {
        fragment.append(segment);
        continue;
      }

      const mark = document.createElement("mark");
      mark.dataset.readerHighlight = String(activeHighlights[0].id);
      mark.dataset.readerHighlightIds = activeHighlights
        .map((highlight) => highlight.id)
        .join(",");
      mark.dataset.readerHighlightCount = String(activeHighlights.length);
      if (activeHighlights.some((highlight) => highlight.note?.trim())) {
        mark.dataset.readerNote = "true";
      }
      if (
        focusedHighlightId !== undefined &&
        activeHighlights.some(
          (highlight) => highlight.id === focusedHighlightId,
        )
      ) {
        mark.dataset.readerHighlightFocus = "true";
      }
      mark.append(segment);
      fragment.append(mark);
    }
    node.replaceWith(fragment);
  }
}

export function renderHighlights(
  root: HTMLElement,
  highlights: ArticleHighlight[],
  focusedHighlightId?: number,
) {
  clearRenderedHighlights(root);
  const renderable = renderableHighlights(root.textContent ?? "", highlights);
  wrapHighlightSegments(root, renderable, focusedHighlightId);
}

/** Updates note affordances without touching the text nodes that form a mark. */
export function syncHighlightNotes(
  root: HTMLElement,
  highlights: ArticleHighlight[],
) {
  const noteById = new Map(
    highlights.map((highlight) => [highlight.id, highlight.note]),
  );
  for (const mark of root.querySelectorAll<HTMLElement>(
    "mark[data-reader-highlight]",
  )) {
    if (
      highlightIdsForMark(mark).some((highlightId) =>
        noteById.get(highlightId)?.trim(),
      )
    ) {
      mark.dataset.readerNote = "true";
    } else {
      delete mark.dataset.readerNote;
    }
  }
}

/**
 * The reading canvas (docs/features.md v0.2 rendering polish): renders the
 * sanitized article HTML and layers in client-side enhancements —
 *
 * - Code blocks are syntax-highlighted with highlight.js, auto-detected (the
 *   sanitizer strips class attributes, so language hints don't survive ingest).
 *   The library is dynamically imported only when the article actually
 *   contains a <pre>, so prose-only reading never pays for it.
 * - Images click-to-zoom into a lightbox. Rendered through a portal: the
 *   row-entrance animation leaves a transform on every list row (fill-mode
 *   "both"), which would otherwise turn position:fixed into
 *   position-relative-to-the-row.
 *
 * Images are already lazy (`loading="lazy"` is stamped at ingest by
 * src/lib/feeds/sanitize.ts). Used for feed items, extracted full content, and
 * saved pages alike — they all flow through the same sanitizer.
 * - Trusted video and X embeds render as light links, and load only after the
 *   reader activates them. The same HTML rewrite protects older stored items.
 */
function activateEmbed(link: HTMLAnchorElement) {
  const embed = deferredEmbedFromUrl(link.href);
  if (!embed) return false;

  const frame = document.createElement("iframe");
  frame.src = embed.frameSrc;
  frame.title = `Embedded ${embed.label}`;
  frame.loading = "lazy";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allow =
    embed.provider === "tweet"
      ? "clipboard-write"
      : "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  frame.allowFullscreen = true;

  const wrapper = document.createElement("div");
  wrapper.className = "deferred-embed-frame";
  wrapper.dataset.deferredEmbed = embed.provider;
  wrapper.style.setProperty("--embed-aspect-ratio", embed.aspectRatio);
  wrapper.append(frame);
  link.replaceWith(wrapper);
  return true;
}

export function ArticleContent({
  html,
  embedLoading,
  itemId,
  audioProgress = {},
  onAudioProgressChange,
  highlights = [],
  focusHighlightId,
  onCreateHighlight,
  onUpdateHighlightNote,
  onDeleteHighlight,
}: {
  html: string;
  embedLoading: EmbedLoadingPreferences;
  /** Feed item id when article-embedded audio should resume across devices. */
  itemId?: number;
  audioProgress?: AudioProgressByUrl;
  onAudioProgressChange?: (
    url: string,
    progress: number | null,
  ) => Promise<boolean>;
  highlights?: ArticleHighlight[];
  /** Highlight-library source links open and center this persisted annotation. */
  focusHighlightId?: number;
  onCreateHighlight?: (
    anchor: HighlightAnchor,
    note: string,
  ) => Promise<boolean>;
  onUpdateHighlightNote?: (
    highlightId: number,
    note: string,
  ) => Promise<boolean>;
  onDeleteHighlight?: (highlightId: number) => Promise<void>;
}) {
  // This also converts iframe HTML stored before deferred embeds shipped.
  const renderedHtml = deferEmbedsHtml(html);
  const ref = useRef<HTMLDivElement>(null);
  const sourceHtmlRef = useRef(renderedHtml);
  const audioProgressRef = useRef(audioProgress);
  const onAudioProgressChangeRef = useRef(onAudioProgressChange);
  const focusedHighlightRef = useRef<number | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const highlightDialogRef = useRef<HTMLElement>(null);
  const selectionDialogRef = useRef<HTMLDivElement>(null);
  const [articleHtml, setArticleHtml] = useState(renderedHtml);
  // React treats a freshly-created dangerouslySetInnerHTML object as an update.
  // Keep its identity stable when reader state changes so native media and text
  // selection remain attached to the existing article DOM.
  const articleMarkup = useMemo(() => ({ __html: articleHtml }), [articleHtml]);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] =
    useState<PendingHighlight | null>(null);
  const [savingHighlight, setSavingHighlight] = useState(false);
  const [openHighlight, setOpenHighlight] = useState<OpenHighlight | null>(
    null,
  );
  const [highlightPicker, setHighlightPicker] =
    useState<HighlightPicker | null>(null);
  const [editingHighlightId, setEditingHighlightId] = useState<number | null>(
    null,
  );
  const [editedNote, setEditedNote] = useState("");
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const [audioSaveError, setAudioSaveError] = useState<string | null>(null);
  audioProgressRef.current = audioProgress;
  onAudioProgressChangeRef.current = onAudioProgressChange;

  useEffect(() => {
    const container = ref.current;
    if (
      !articleHtml ||
      !container ||
      itemId === undefined ||
      !onAudioProgressChangeRef.current
    ) {
      return;
    }
    return bindArticleAudioProgress(container, {
      initialProgressByUrl: audioProgressRef.current,
      onProgressChange: (audioUrl, progress) => {
        const persist = onAudioProgressChangeRef.current;
        if (!persist) return;
        void persist(audioUrl, progress)
          .then((saved) => {
            setAudioSaveError(
              saved
                ? null
                : "Couldn't save listening position. Try playing or pausing again.",
            );
          })
          .catch(() => {
            setAudioSaveError(
              "Couldn't save listening position. Try playing or pausing again.",
            );
          });
      },
    });
  }, [articleHtml, itemId]);

  useEffect(() => {
    if (!renderedHtml) return;
    const container = ref.current;
    if (!container) return;
    // Highlight the <code> inside each <pre>, or the bare <pre> itself (feeds
    // often omit the inner <code>). Skip blocks hljs already processed.
    const blocks = [...container.querySelectorAll("pre")]
      .map((pre) => pre.querySelector("code") ?? pre)
      .filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && el.dataset.highlighted !== "yes",
      );
    if (blocks.length === 0) return;

    let cancelled = false;
    void import("highlight.js/lib/common").then(({ default: hljs }) => {
      if (cancelled) return;
      for (const el of blocks) hljs.highlightElement(el);
      setArticleHtml((current) =>
        current === container.innerHTML ? current : container.innerHTML,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [renderedHtml]);

  useEffect(() => {
    if (!renderedHtml) return;
    const container = ref.current;
    if (!container) return;
    let changed = false;
    for (const link of container.querySelectorAll<HTMLAnchorElement>(
      "a[data-deferred-embed]",
    )) {
      const embed = deferredEmbedFromUrl(link.href);
      if (
        embed &&
        resolveEmbedLoading(embedLoading, embed.provider) === "auto"
      ) {
        changed = activateEmbed(link) || changed;
      }
    }
    if (changed) {
      setArticleHtml((current) =>
        current === container.innerHTML ? current : container.innerHTML,
      );
    }
  }, [embedLoading, renderedHtml]);

  // Persisted annotations become part of the React-owned HTML value. That keeps
  // their markup intact when opening or closing annotation controls rerenders.
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    if (sourceHtmlRef.current !== renderedHtml) {
      container.innerHTML = renderedHtml;
      sourceHtmlRef.current = renderedHtml;
    }
    renderHighlights(container, highlights, focusHighlightId);
    syncHighlightNotes(container, highlights);
    const nextHtml = container.innerHTML;
    setArticleHtml((current) => (current === nextHtml ? current : nextHtml));
  }, [focusHighlightId, highlights, renderedHtml]);

  useEffect(() => {
    if (
      focusHighlightId === undefined ||
      focusedHighlightRef.current === focusHighlightId ||
      !articleHtml.includes("data-reader-highlight")
    ) {
      return;
    }
    const container = ref.current;
    if (!container) return;
    const mark = [
      ...container.querySelectorAll<HTMLElement>("mark[data-reader-highlight]"),
    ].find((candidate) =>
      highlightIdsForMark(candidate).includes(focusHighlightId),
    );
    if (!mark) return;

    focusedHighlightRef.current = focusHighlightId;
    const frame = window.requestAnimationFrame(() => {
      mark.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [articleHtml, focusHighlightId]);

  useEffect(() => {
    if (editingHighlightId !== null) noteInputRef.current?.focus();
  }, [editingHighlightId]);

  useEffect(() => {
    if (!pendingHighlight && !openHighlight && !highlightPicker) return;
    function dismissOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const clickedHighlight =
        target instanceof Element &&
        target.closest("mark[data-reader-highlight]") !== null;
      if (
        clickedHighlight ||
        selectionDialogRef.current?.contains(target) ||
        highlightDialogRef.current?.contains(target)
      ) {
        return;
      }
      if (pendingHighlight) {
        setPendingHighlight(null);
        window.getSelection()?.removeAllRanges();
      }
      setOpenHighlight(null);
      setHighlightPicker(null);
      setEditingHighlightId(null);
    }
    window.addEventListener("pointerdown", dismissOnOutsidePointerDown);
    return () =>
      window.removeEventListener("pointerdown", dismissOnOutsidePointerDown);
  }, [highlightPicker, openHighlight, pendingHighlight]);

  // While the lightbox is open it owns the keyboard: Esc closes, and nothing
  // leaks through to the reading canon (j/k/space must not act behind it).
  useEffect(() => {
    if (!zoomSrc) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomSrc(null);
      e.stopPropagation();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [zoomSrc]);

  function onClick(e: React.MouseEvent) {
    const target = e.target instanceof Element ? e.target : null;
    const link = target?.closest<HTMLAnchorElement>("a[data-deferred-embed]");
    if (link) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      if (activateEmbed(link)) {
        const container = ref.current;
        if (container) setArticleHtml(container.innerHTML);
        e.preventDefault();
      }
      return;
    }

    const mark = target?.closest<HTMLElement>("mark[data-reader-highlight]");
    if (mark) {
      const markHighlightIds = highlightIdsForMark(mark);
      const markHighlights = markHighlightIds
        .map((id) => highlights.find((candidate) => candidate.id === id))
        .filter((highlight): highlight is ArticleHighlight =>
          Boolean(highlight),
        );
      const container = ref.current;
      if (markHighlights.length === 0 || !container) return;
      e.preventDefault();
      const markRect = mark.getBoundingClientRect();
      const rootRect = container.getBoundingClientRect();
      const position = {
        left: Math.max(
          0,
          Math.min(markRect.left - rootRect.left, rootRect.width - 288),
        ),
        top: markRect.bottom - rootRect.top + 8,
      };
      setPendingHighlight(null);
      setEditingHighlightId(null);
      if (markHighlights.length > 1) {
        setOpenHighlight(null);
        setHighlightPicker({
          ids: markHighlights.map((highlight) => highlight.id),
          ...position,
        });
        return;
      }

      const [highlight] = markHighlights;
      setHighlightPicker(null);
      setOpenHighlight((current) =>
        current?.id === highlight.id
          ? null
          : {
              id: highlight.id,
              ...position,
            },
      );
      return;
    }

    const img = target?.closest("img");
    if (!img?.src) return;
    // Zoom instead of following a wrapping link — "Open original" covers links.
    e.preventDefault();
    setZoomSrc(img.src);
  }

  function captureSelection() {
    const container = ref.current;
    if (!container) return;
    const anchor = selectionAnchor(container);
    if (!anchor) {
      setPendingHighlight(null);
      return;
    }
    const range = window.getSelection()?.getRangeAt(0);
    if (!range) return;
    const selectedRect = range.getBoundingClientRect();
    const rootRect = container.getBoundingClientRect();
    setPendingHighlight({
      anchor,
      left: Math.max(
        0,
        Math.min(selectedRect.left - rootRect.left, rootRect.width - 288),
      ),
      top: selectedRect.bottom - rootRect.top + 8,
      note: "",
    });
  }

  function dismissPendingHighlight() {
    setPendingHighlight(null);
    window.getSelection()?.removeAllRanges();
  }

  async function saveHighlight(note: string) {
    if (!pendingHighlight || !onCreateHighlight || savingHighlight) return;
    setSavingHighlight(true);
    try {
      if (await onCreateHighlight(pendingHighlight.anchor, note)) {
        setPendingHighlight(null);
        window.getSelection()?.removeAllRanges();
      }
    } finally {
      setSavingHighlight(false);
    }
  }

  function startEditingNote(highlight: ArticleHighlight) {
    setEditedNote(highlight.note ?? "");
    setEditingHighlightId(highlight.id);
  }

  async function saveEditedNote(highlight: ArticleHighlight) {
    if (!onUpdateHighlightNote || savingNoteId !== null) return;
    setSavingNoteId(highlight.id);
    try {
      if (await onUpdateHighlightNote(highlight.id, editedNote)) {
        setEditingHighlightId(null);
      }
    } finally {
      setSavingNoteId(null);
    }
  }

  async function deleteHighlight(highlight: ArticleHighlight) {
    if (!onDeleteHighlight || savingNoteId !== null) return;
    setSavingNoteId(highlight.id);
    try {
      await onDeleteHighlight(highlight.id);
      setOpenHighlight(null);
      setHighlightPicker(null);
      setEditingHighlightId(null);
    } finally {
      setSavingNoteId(null);
    }
  }

  const selectedHighlight = openHighlight
    ? (highlights.find((highlight) => highlight.id === openHighlight.id) ??
      null)
    : null;
  const pickerHighlights = highlightPicker
    ? highlightPicker.ids.flatMap((id) => {
        const highlight = highlights.find((candidate) => candidate.id === id);
        return highlight ? [highlight] : [];
      })
    : [];

  return (
    <>
      <div className="relative">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: delegated image-zoom click and text-selection affordance */}
        <div
          ref={ref}
          onClick={onClick}
          onMouseUp={captureSelection}
          onKeyUp={captureSelection}
          className="article-content"
          // Sanitized at ingest/extraction (src/lib/feeds/sanitize.ts).
          // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized before storage
          dangerouslySetInnerHTML={articleMarkup}
        />
        {highlightPicker && pickerHighlights.length > 1 ? (
          <aside
            ref={highlightDialogRef}
            aria-label="Choose overlapping highlight"
            className="absolute z-20 w-72 max-w-[calc(100%-0.5rem)] space-y-3 rounded-lg border border-primary/25 bg-popover p-3 text-popover-foreground shadow-lg"
            style={{ left: highlightPicker.left, top: highlightPicker.top }}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close highlight chooser"
              onClick={() => setHighlightPicker(null)}
              className="absolute top-1.5 right-1.5"
            >
              <XIcon />
            </Button>
            <div className="pr-7">
              <p className="text-sm font-medium">
                {pickerHighlights.length} highlights overlap here
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Choose one to view or edit its note.
              </p>
            </div>
            <div className="space-y-1.5">
              {pickerHighlights.map((highlight) => (
                <button
                  key={highlight.id}
                  type="button"
                  className="w-full rounded-md border border-border px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => {
                    setHighlightPicker(null);
                    setOpenHighlight({
                      id: highlight.id,
                      left: highlightPicker.left,
                      top: highlightPicker.top,
                    });
                  }}
                >
                  <span className="line-clamp-2 block text-sm leading-5">
                    {highlight.quote}
                  </span>
                  <span className="line-clamp-1 mt-1 block text-xs text-muted-foreground">
                    {highlight.note?.trim()
                      ? `Note: ${highlight.note}`
                      : "No note yet"}
                  </span>
                </button>
              ))}
            </div>
          </aside>
        ) : null}
        {selectedHighlight && openHighlight ? (
          <aside
            ref={highlightDialogRef}
            aria-label="Highlight details"
            className="absolute z-20 w-72 max-w-[calc(100%-0.5rem)] space-y-3 rounded-lg border border-primary/25 bg-popover p-3 text-popover-foreground shadow-lg"
            style={{ left: openHighlight.left, top: openHighlight.top }}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close highlight details"
              onClick={() => setOpenHighlight(null)}
              className="absolute top-1.5 right-1.5"
            >
              <XIcon />
            </Button>
            <blockquote className="line-clamp-3 mr-6 border-l-2 border-primary/60 pl-2 text-xs text-muted-foreground italic">
              {selectedHighlight.quote}
            </blockquote>
            {editingHighlightId === selectedHighlight.id ? (
              <textarea
                ref={noteInputRef}
                aria-label="Note for highlight"
                value={editedNote}
                maxLength={2_000}
                rows={3}
                onChange={(event) => setEditedNote(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    void saveEditedNote(selectedHighlight);
                  }
                }}
                placeholder="Add a note…"
                className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            ) : selectedHighlight.note?.trim() ? (
              <p className="text-sm leading-6">{selectedHighlight.note}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No note yet.</p>
            )}
            <div className="flex items-center justify-between gap-2">
              {editingHighlightId === selectedHighlight.id ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingNoteId === selectedHighlight.id}
                    onClick={() => void saveEditedNote(selectedHighlight)}
                  >
                    {savingNoteId === selectedHighlight.id
                      ? "Saving…"
                      : "Save note"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={savingNoteId === selectedHighlight.id}
                    onClick={() => setEditingHighlightId(null)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startEditingNote(selectedHighlight)}
                  >
                    <PencilIcon data-icon="inline-start" />
                    {selectedHighlight.note?.trim() ? "Edit note" : "Add note"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={savingNoteId === selectedHighlight.id}
                    onClick={() => void deleteHighlight(selectedHighlight)}
                    className="text-destructive hover:text-destructive"
                  >
                    Delete highlight
                  </Button>
                </>
              )}
            </div>
          </aside>
        ) : null}
        {pendingHighlight && onCreateHighlight ? (
          <div
            ref={selectionDialogRef}
            role="dialog"
            aria-label="Save selected highlight"
            className="absolute z-20 w-72 max-w-[calc(100%-0.5rem)] space-y-3 rounded-lg border border-border bg-popover p-3 shadow-lg"
            style={{
              left: pendingHighlight.left,
              top: pendingHighlight.top,
            }}
          >
            <p className="line-clamp-3 border-l-2 border-primary/60 pl-2 text-xs text-muted-foreground italic">
              {pendingHighlight.anchor.quote}
            </p>
            <textarea
              aria-label="Optional note for selected highlight"
              value={pendingHighlight.note}
              maxLength={2_000}
              rows={2}
              onChange={(event) =>
                setPendingHighlight((current) =>
                  current ? { ...current, note: event.target.value } : current,
                )
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void saveHighlight(pendingHighlight.note);
                }
              }}
              placeholder="Add a note (optional)…"
              className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                disabled={savingHighlight}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void saveHighlight(pendingHighlight.note)}
              >
                <HighlighterIcon data-icon="inline-start" />
                {savingHighlight ? "Saving…" : "Save highlight"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss selected text"
                onMouseDown={(event) => event.preventDefault()}
                onClick={dismissPendingHighlight}
              >
                <XIcon />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {audioSaveError ? (
        <output className="mt-2 block text-xs text-destructive">
          {audioSaveError}
        </output>
      ) : null}
      {zoomSrc
        ? createPortal(
            <button
              type="button"
              aria-label="Close image"
              onClick={() => setZoomSrc(null)}
              className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-4 sm:p-8"
            >
              {/* Favicons use <img> app-wide (arbitrary origins); same story here. */}
              {/* biome-ignore lint/performance/noImgElement: arbitrary feed origins, full-size passthrough */}
              <img
                src={zoomSrc}
                alt=""
                className="max-h-full max-w-full rounded-md object-contain"
              />
            </button>,
            document.body,
          )
        : null}
    </>
  );
}
