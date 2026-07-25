"use client";

import {
  BookmarkCheckIcon,
  BookmarkIcon,
  CheckIcon,
  CircleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  RotateCwIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { ArticleLabelPicker } from "@/components/article-label-picker";
import type { ReaderLabel } from "@/lib/labels";
import type { ReaderItem } from "@/lib/reader";

/**
 * What an open article offers to do with itself. Feed articles and saved pages
 * diverge here — read state lives in different tables, and a saved page has no
 * star or read-later of its own — so each kind gets its own set rather than a
 * shared row of buttons with holes in it.
 */
export interface ArticleRowActionHandlers {
  keepOffline: (item: ReaderItem, contentHtml: string) => void;
  updateLabels: (
    item: ReaderItem,
    label: ReaderLabel,
    assigned: boolean,
  ) => void;
  retryPage: (item: ReaderItem) => void;
  retryFullContent: (item: ReaderItem) => void;
  toggleStarred: (item: ReaderItem) => void;
  toggleReadLater: (item: ReaderItem) => void;
  /** Marking unread here also closes the row; the `m` key does not. */
  toggleRead: (item: ReaderItem) => void;
  removePage: (item: ReaderItem) => void;
}

interface Props {
  item: ReaderItem;
  contentHtml: string | null;
  fullTextUnavailable: boolean;
  labels: ReaderLabel[];
  handlers: ArticleRowActionHandlers;
}

export function ArticleRowActions({
  item,
  contentHtml,
  fullTextUnavailable,
  labels,
  handlers,
}: Props) {
  const isPage = item.kind === "page";
  const readIcon = item.read ? (
    <CircleIcon className="size-3.5" />
  ) : (
    <CheckIcon className="size-3.5" />
  );
  const readLabel = item.read ? "Mark unread" : "Mark read";

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-xs">
      {item.url ? (
        <ActionButton asLink href={item.url}>
          <ExternalLinkIcon className="size-3.5" />
          Open original
        </ActionButton>
      ) : null}
      {contentHtml ? (
        <ActionButton onClick={() => handlers.keepOffline(item, contentHtml)}>
          <DownloadIcon className="size-3.5" />
          Keep offline
        </ActionButton>
      ) : null}
      <ArticleLabelPicker
        item={item}
        labels={labels}
        onChange={(label, assigned) =>
          handlers.updateLabels(item, label, assigned)
        }
      />
      {isPage ? (
        <>
          {item.pageStatus === "error" ? (
            <ActionButton onClick={() => handlers.retryPage(item)}>
              <RotateCwIcon className="size-3.5" />
              Retry
            </ActionButton>
          ) : null}
          <ActionButton onClick={() => handlers.toggleRead(item)}>
            {readIcon}
            {readLabel}
          </ActionButton>
          <ActionButton onClick={() => handlers.removePage(item)}>
            <Trash2Icon className="size-3.5" />
            Remove
          </ActionButton>
        </>
      ) : (
        <>
          {fullTextUnavailable && item.url ? (
            <ActionButton onClick={() => handlers.retryFullContent(item)}>
              <RotateCwIcon className="size-3.5" />
              Retry full text
            </ActionButton>
          ) : null}
          <ActionButton onClick={() => handlers.toggleStarred(item)}>
            <StarIcon
              className={`size-3.5 ${item.starred ? "fill-current text-primary" : ""}`}
            />
            {item.starred ? "Unstar" : "Star"}
          </ActionButton>
          <ActionButton onClick={() => handlers.toggleReadLater(item)}>
            {item.readLater ? (
              <BookmarkCheckIcon className="size-3.5 text-primary" />
            ) : (
              <BookmarkIcon className="size-3.5" />
            )}
            {item.readLater ? "Saved" : "Read later"}
          </ActionButton>
          <ActionButton onClick={() => handlers.toggleRead(item)}>
            {readIcon}
            {readLabel}
          </ActionButton>
        </>
      )}
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
