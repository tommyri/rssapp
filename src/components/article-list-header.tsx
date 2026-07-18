"use client";

import { Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ArticleListHeaderProps {
  title: string;
  unreadCount: number;
  isSearch: boolean;
  isArchiveView: boolean;
  toggleHref: string;
  showingAll: boolean;
  expanded: boolean;
  readingProgress: number;
  focusMode: boolean;
  onToggleFocus: () => void;
  onMarkAll: (olderThanDays: number | null) => Promise<void>;
  statusMessage: string;
}

export function ArticleListHeader({
  title,
  unreadCount,
  isSearch,
  isArchiveView,
  toggleHref,
  showingAll,
  expanded,
  readingProgress,
  focusMode,
  onToggleFocus,
  onMarkAll,
  statusMessage,
}: ArticleListHeaderProps) {
  return (
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
          {!isArchiveView ? (
            <MarkAllControl onMark={onMarkAll} statusMessage={statusMessage} />
          ) : null}
        </div>
      ) : null}
      {expanded ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <div className="flex min-w-48 flex-1 items-center gap-2">
            <span className="shrink-0 tabular-nums">
              Reading {Math.round(readingProgress * 100)}%
            </span>
            <div
              role="progressbar"
              aria-label="Reading progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(readingProgress * 100)}
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${readingProgress * 100}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleFocus}
            aria-pressed={focusMode}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
          >
            {focusMode ? (
              <Minimize2Icon className="size-3.5" />
            ) : (
              <Maximize2Icon className="size-3.5" />
            )}
            {focusMode ? "Exit focus" : "Focus"}
          </button>
        </div>
      ) : null}
    </header>
  );
}

function MarkAllControl({
  onMark,
  statusMessage,
}: {
  onMark: (olderThanDays: number | null) => Promise<void>;
  statusMessage: string;
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
      {statusMessage ? <span>{statusMessage}</span> : null}
      <select
        value={scope}
        onChange={(event) => setScope(event.target.value)}
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
