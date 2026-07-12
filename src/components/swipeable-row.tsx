"use client";

import { type ReactNode, useRef, useState } from "react";
import { clampSwipe, SWIPE_TRIGGER_PX, swipeIntent } from "@/lib/swipe";

/**
 * Touch swipe actions for a list row (docs/features.md v0.2): the row follows
 * the finger once a drag is clearly horizontal, reveals an action icon in the
 * vacated strip, arms at SWIPE_TRIGGER_PX, and fires on release. Vertical
 * scrolling always wins (touch-action: pan-y + the intent check), and a drag
 * suppresses the tap so triggering an action never also expands the row.
 * Touch-only by nature — mouse/trackpad users never fire these events.
 */
export function SwipeableRow({
  onSwipeRight,
  onSwipeLeft,
  rightIcon,
  leftIcon,
  children,
}: {
  /** Swipe left-to-right (reveals at the left edge), e.g. toggle read. */
  onSwipeRight?: () => void;
  /** Swipe right-to-left (reveals at the right edge), e.g. toggle read later. */
  onSwipeLeft?: () => void;
  rightIcon?: ReactNode;
  leftIcon?: ReactNode;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
    horizontal.current = false;
    setSettling(false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const rawDx = t.clientX - start.current.x;
    const rawDy = t.clientY - start.current.y;

    if (!horizontal.current) {
      const intent = swipeIntent(rawDx, rawDy);
      if (intent === "vertical") {
        // The browser is scrolling; stand down for the rest of this touch.
        start.current = null;
        return;
      }
      if (intent === "pending") return;
      horizontal.current = true;
    }
    setDx(clampSwipe(rawDx, Boolean(onSwipeRight), Boolean(onSwipeLeft)));
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (horizontal.current) {
      // A drag is not a tap: keep the browser from synthesizing a click that
      // would also expand/collapse the row. (touchend is non-passive in React.)
      e.preventDefault();
      if (dx >= SWIPE_TRIGGER_PX) onSwipeRight?.();
      else if (dx <= -SWIPE_TRIGGER_PX) onSwipeLeft?.();
    }
    start.current = null;
    horizontal.current = false;
    setSettling(true);
    setDx(0);
  }

  const armed = Math.abs(dx) >= SWIPE_TRIGGER_PX;

  return (
    <div className="relative">
      {dx !== 0 ? (
        <div
          aria-hidden
          style={{ width: Math.abs(dx) }}
          className={`absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-md transition-colors ${
            dx > 0 ? "left-0" : "right-0"
          } ${armed ? "bg-primary/15 text-primary" : "bg-accent/60 text-muted-foreground"}`}
        >
          {dx > 0 ? rightIcon : leftIcon}
        </div>
      ) : null}
      <div
        className="touch-pan-y"
        style={{
          transform: dx !== 0 ? `translateX(${dx}px)` : undefined,
          transition: settling ? "transform 150ms ease-out" : undefined,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
