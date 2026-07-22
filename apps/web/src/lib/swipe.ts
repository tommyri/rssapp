// Pure gesture math for row swipe actions (docs/features.md v0.2 mobile swipe
// gestures). DOM-free so it's unit-testable; the touch plumbing lives in
// src/components/swipeable-row.tsx.

/** Finger travel before we decide whether a touch is a swipe or a scroll. */
export const SWIPE_SLOP_PX = 12;
/** Horizontal must beat vertical by this ratio to claim the gesture. */
const HORIZONTAL_RATIO = 1.5;
/** Release at or past this offset triggers the action. */
export const SWIPE_TRIGGER_PX = 72;
/** The row never translates further than this (soft cap, no rubber-band math). */
export const SWIPE_MAX_PX = 112;

export type SwipeIntent = "pending" | "horizontal" | "vertical";

/**
 * Classify a touch by its travel so far: horizontal (we own it — the row
 * follows the finger), vertical (the browser's scroll — leave it alone), or
 * pending (too early to tell). Vertical wins ties: hijacking a scroll feels
 * far worse than missing a swipe.
 */
export function swipeIntent(dx: number, dy: number): SwipeIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > SWIPE_SLOP_PX && ax > ay * HORIZONTAL_RATIO) return "horizontal";
  if (ay > SWIPE_SLOP_PX) return "vertical";
  return "pending";
}

/**
 * The row offset for a finger offset: directions without a handler don't move
 * (a swipe that can't do anything shouldn't pretend it might), and travel is
 * capped so the row can't be flung off-screen.
 */
export function clampSwipe(
  dx: number,
  hasRightAction: boolean,
  hasLeftAction: boolean,
): number {
  if (dx > 0 && !hasRightAction) return 0;
  if (dx < 0 && !hasLeftAction) return 0;
  return Math.max(-SWIPE_MAX_PX, Math.min(SWIPE_MAX_PX, dx));
}
