"use client";

import { RefreshCwIcon } from "lucide-react";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { type ActionState, refreshFeedsAction } from "@/app/actions";
import {
  pullToRefreshArmed,
  pullToRefreshDistance,
} from "@/lib/pull-to-refresh";
import { getReaderScrollContainer } from "@/lib/reader-scroll";

interface TouchStart {
  x: number;
  y: number;
}

export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [status, setStatus] = useState<ActionState | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const start = useRef<TouchStart | null>(null);
  const pullDistanceRef = useRef(0);

  function setPull(next: number) {
    pullDistanceRef.current = next;
    setPullDistance(next);
  }

  function resetPull() {
    start.current = null;
    setPull(0);
  }

  function refresh() {
    setStatus(null);
    startRefresh(async () => {
      try {
        setStatus(await refreshFeedsAction());
      } catch {
        setStatus({ ok: false, message: "Refresh failed." });
      }
    });
  }

  function onTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (refreshing) return;
    const scrollElement = getReaderScrollContainer(event.currentTarget);
    if (scrollElement.scrollTop > 0) return;
    const touch = event.touches[0];
    if (touch) start.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const initial = start.current;
    const touch = event.touches[0];
    if (!initial || !touch) return;

    const current = { x: touch.clientX, y: touch.clientY };
    const distance = pullToRefreshDistance(
      initial,
      current,
      getReaderScrollContainer(event.currentTarget).scrollTop,
    );
    if (distance === 0) {
      const deltaX = current.x - initial.x;
      const deltaY = current.y - initial.y;
      if (deltaY < 0 || Math.abs(deltaX) > deltaY) start.current = null;
      return;
    }

    // We own this overscroll only after it is known to be a vertical pull.
    event.preventDefault();
    setPull(distance);
  }

  function onTouchEnd() {
    const shouldRefresh = pullToRefreshArmed(pullDistanceRef.current);
    resetPull();
    if (shouldRefresh) refresh();
  }

  return (
    <div
      className="relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={resetPull}
    >
      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-0 flex h-16 items-center justify-center gap-2 text-xs text-muted-foreground"
      >
        <RefreshCwIcon
          className={`size-4 ${refreshing ? "animate-spin" : ""}`}
        />
        <span>
          {refreshing
            ? "Refreshing feeds…"
            : pullToRefreshArmed(pullDistance)
              ? "Release to refresh"
              : "Pull to refresh"}
        </span>
      </div>
      {status ? (
        <output
          className={`absolute inset-x-4 top-2 z-20 rounded-md border bg-background/95 px-3 py-2 text-center text-xs shadow-sm ${
            status.ok ? "text-muted-foreground" : "text-destructive"
          }`}
        >
          {status.message}
        </output>
      ) : null}
      <div
        style={{
          transform:
            pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pullDistance === 0 ? "transform 150ms ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
