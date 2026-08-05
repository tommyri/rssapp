"use client";

import { BookmarkCheckIcon, LinkIcon, StarIcon } from "lucide-react";
import type { ArticleListDensityClasses } from "@/lib/article-list-density";
import { alsoInLabel } from "@/lib/duplicates";
import { relativeTime } from "@/lib/format";
import type { ReaderItem } from "@/lib/reader";

interface Props {
  item: ReaderItem;
  isOpen: boolean;
  density: ArticleListDensityClasses;
  /** Saved-page extraction status; shown instead of a snippet while set. */
  pageSubtitle: string;
  snippet: string;
  /** Reading estimate, or null when there is too little text to claim one. */
  minutes: number | null;
  fullTextPending: boolean;
  onToggle: () => void;
}

/**
 * The always-visible part of an article row.
 *
 * Collapsed, the whole header is one button that opens the article. Open, the
 * title becomes the link to the original and the rest of the header — dot,
 * metadata, surrounding padding — still closes the article. That needs two
 * separate controls: an `<a>` inside a `<button>` is invalid HTML and browsers
 * won't follow it. So the close control is a real button stretched behind the
 * text, which keeps it named and keyboard-reachable, and the text above it
 * ignores pointer events apart from the title link itself.
 */
export function ArticleRowHeader({
  item,
  isOpen,
  density,
  pageSubtitle,
  snippet,
  minutes,
  fullTextPending,
  onToggle,
}: Props) {
  const title = item.title ?? "(untitled)";

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`group flex w-full cursor-pointer items-start text-left transition-colors hover:bg-accent/40 ${density.header}`}
      >
        <UnreadDot item={item} density={density} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-semibold ${density.title} ${
              item.read ? "text-muted-foreground" : ""
            }`}
          >
            <TitleMarkers item={item} />
            {title}
          </span>
          {/* No `block` here: the density classes clamp the snippet with
              line-clamp, which needs its own display value. Adding `block`
              silently wins and the clamp stops working — rows then grow to 5–6
              lines on a phone. */}
          {pageSubtitle || snippet ? (
            <span
              className={`${density.snippet} ${
                item.read ? "text-muted-foreground/60" : "text-muted-foreground"
              }`}
            >
              {pageSubtitle || snippet}
            </span>
          ) : null}
          <RowMetadata
            item={item}
            isOpen={false}
            density={density}
            minutes={minutes}
            fullTextPending={fullTextPending}
          />
        </span>
      </button>
    );
  }

  return (
    <div className={`relative flex items-start ${density.header}`}>
      <button
        type="button"
        aria-label="Close article"
        onClick={onToggle}
        className="absolute inset-0 cursor-pointer transition-colors hover:bg-accent/40"
      />
      <UnreadDot
        item={item}
        density={density}
        className="pointer-events-none relative"
      />
      <span className="pointer-events-none relative min-w-0 flex-1">
        <span className="block font-serif text-[22px] leading-tight font-bold">
          <TitleMarkers item={item} />
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the original in a new tab"
              className="pointer-events-auto hover:underline"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </span>
        <RowMetadata
          item={item}
          isOpen
          density={density}
          minutes={minutes}
          fullTextPending={fullTextPending}
        />
      </span>
    </div>
  );
}

function UnreadDot({
  item,
  density,
  className = "",
}: {
  item: ReaderItem;
  density: ArticleListDensityClasses;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-reader-unread-dot
      className={`${density.unreadDot} ${className} size-2 shrink-0 rounded-full transition-colors ${
        item.read ? "bg-transparent" : "bg-primary"
      }`}
    />
  );
}

/** Inline state markers that read as part of the title itself. */
function TitleMarkers({ item }: { item: ReaderItem }) {
  return (
    <>
      {item.starred ? (
        <StarIcon className="mr-1 inline-block size-3.5 fill-current align-[-0.15em] text-primary" />
      ) : null}
      {item.kind === "page" ? (
        <LinkIcon className="mr-1 inline-block size-3.5 align-[-0.15em] text-muted-foreground" />
      ) : item.readLater ? (
        <BookmarkCheckIcon className="mr-1 inline-block size-3.5 align-[-0.15em] text-primary" />
      ) : null}
    </>
  );
}

function RowMetadata({
  item,
  isOpen,
  density,
  minutes,
  fullTextPending,
}: {
  item: ReaderItem;
  isOpen: boolean;
  density: ArticleListDensityClasses;
  minutes: number | null;
  fullTextPending: boolean;
}) {
  const isPage = item.kind === "page";

  return (
    <span
      className={`block text-muted-foreground/80 ${density.metadata} ${
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
      {/* "N min read" (the Medium convention): no "~" — it doubles up
          punctuation after the separator dot, and "read" keeps it from scanning
          as a second timestamp. */}
      {minutes !== null ? ` · ${minutes} min read` : ""}
      {isOpen && !isPage && item.fullContentHtml ? (
        <span className="italic"> · full content</span>
      ) : isOpen && fullTextPending ? (
        <span className="italic"> · preparing full text</span>
      ) : null}
      {item.labels && item.labels.length > 0 ? (
        <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
          {item.labels.map((label) => (
            <span
              key={label.id}
              className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {label.name}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
