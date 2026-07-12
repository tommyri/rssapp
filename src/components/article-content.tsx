"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type EmbedLoadingPreferences,
  resolveEmbedLoading,
} from "@/lib/embed-loading";
import {
  deferEmbedsHtml,
  deferredEmbedFromUrl,
} from "@/lib/feeds/deferred-embeds";

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
}: {
  html: string;
  embedLoading: EmbedLoadingPreferences;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  // This also converts iframe HTML stored before deferred embeds shipped.
  const renderedHtml = deferEmbedsHtml(html);

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
    });
    return () => {
      cancelled = true;
    };
  }, [renderedHtml]);

  useEffect(() => {
    if (!renderedHtml) return;
    const container = ref.current;
    if (!container) return;
    for (const link of container.querySelectorAll<HTMLAnchorElement>(
      "a[data-deferred-embed]",
    )) {
      const embed = deferredEmbedFromUrl(link.href);
      if (
        embed &&
        resolveEmbedLoading(embedLoading, embed.provider) === "auto"
      ) {
        activateEmbed(link);
      }
    }
  }, [embedLoading, renderedHtml]);

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
    const link =
      e.target instanceof Element
        ? e.target.closest<HTMLAnchorElement>("a[data-deferred-embed]")
        : null;
    if (link) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      if (activateEmbed(link)) e.preventDefault();
      return;
    }

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
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
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
