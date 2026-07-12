export const READER_SCROLL_SELECTOR = "[data-reader-scroll]";

type ScrollMetrics = Pick<
  HTMLElement,
  "clientHeight" | "scrollHeight" | "scrollTop"
>;

/** The app shell's content pane is the reader's scroll owner. */
export function getReaderScrollContainer(anchor?: Element): HTMLElement {
  return (
    anchor?.closest<HTMLElement>(READER_SCROLL_SELECTOR) ??
    document.querySelector<HTMLElement>(READER_SCROLL_SELECTOR) ??
    document.documentElement
  );
}

/** Pixels the reader can still scroll before an end-of-article advance. */
export function remainingReaderScroll({
  scrollTop,
  scrollHeight,
  clientHeight,
}: ScrollMetrics): number {
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

/** Space scrolls first; only the final 48px permit advancing to another item. */
export function hasRemainingReaderScroll(
  metrics: ScrollMetrics,
  threshold = 48,
): boolean {
  return remainingReaderScroll(metrics) > threshold;
}
