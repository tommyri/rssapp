const RESUME_MINIMUM = 0.05;
const RESUME_COMPLETE = 0.95;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

interface ArticleGeometry {
  articleTop: number;
  articleHeight: number;
  viewportHeight: number;
}

interface ScrollContainerGeometryInput {
  articleTopInViewport: number;
  containerTopInViewport: number;
  scrollTop: number;
  articleHeight: number;
  viewportHeight: number;
}

/** Convert an article's viewport rectangle into its scroll-container coordinates. */
export function scrollContainerGeometry({
  articleTopInViewport,
  containerTopInViewport,
  scrollTop,
  articleHeight,
  viewportHeight,
}: ScrollContainerGeometryInput): ArticleGeometry & { scrollY: number } {
  return {
    articleTop: articleTopInViewport - containerTopInViewport + scrollTop,
    articleHeight,
    scrollY: scrollTop,
    viewportHeight,
  };
}

function readingRange({
  articleTop,
  articleHeight,
  viewportHeight,
}: ArticleGeometry): { start: number; distance: number } {
  // Leave room for the sticky reader header before the first paragraph counts.
  const topOffset = viewportHeight * 0.15;
  return {
    start: articleTop - topOffset,
    distance: Math.max(1, articleHeight - viewportHeight + topOffset),
  };
}

/** Fraction through an expanded article for the current document scroll position. */
export function readingProgressAtScroll(
  geometry: ArticleGeometry & { scrollY: number },
): number {
  const { start, distance } = readingRange(geometry);
  return clamp((geometry.scrollY - start) / distance);
}

/** Scroll offset that puts a saved fraction of an article back in view. */
export function scrollForReadingProgress(
  geometry: ArticleGeometry & { progress: number },
): number {
  const { start, distance } = readingRange(geometry);
  return Math.max(0, start + clamp(geometry.progress) * distance);
}

/** Null means no resume is useful: the article is effectively untouched or done. */
export function resumableReadingProgress(
  progress: number | null,
): number | null {
  if (progress === null || !Number.isFinite(progress)) return null;
  const clamped = clamp(progress);
  return clamped > RESUME_MINIMUM && clamped < RESUME_COMPLETE ? clamped : null;
}

/** Normalize a live position before persisting it to the reader state. */
export function storedReadingProgress(progress: number): number | null {
  return resumableReadingProgress(progress);
}
