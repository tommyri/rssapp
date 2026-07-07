"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
 */
export function ArticleContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  useEffect(() => {
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
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const img = e.target instanceof Element ? e.target.closest("img") : null;
    if (!img?.src) return;
    // Zoom instead of following a wrapping link — "Open original" covers links.
    e.preventDefault();
    setZoomSrc(img.src);
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: delegated image-zoom click; images aren't reachable controls */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: zoom is a pointer affordance; keyboard reading is untouched */}
      <div
        ref={ref}
        onClick={onClick}
        className="article-content"
        // Sanitized at ingest/extraction (src/lib/feeds/sanitize.ts).
        // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized before storage
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
