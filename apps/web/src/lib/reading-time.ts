// Estimated reading time (docs/features.md v0.2): a scanning aid computed
// from the stored sanitized HTML. Pure and db-free so it's unit-testable.

/** Average adult reading speed; the industry convention is 200–250 wpm. */
const WORDS_PER_MINUTE = 225;

/**
 * Below this the estimate is noise: stub entries (a bare "Comments" link,
 * one-line notices) read instantly and "~1 min" would just clutter the row.
 */
const MIN_WORDS = 30;

/** Count words in sanitized HTML by stripping tags and splitting on whitespace. */
export function wordCount(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? 0 : text.split(" ").length;
}

/**
 * Estimated minutes to read the given (sanitized) HTML, or null when the
 * content is too short for an estimate to mean anything. Rounds up so a
 * 90-second read shows "~2 min" rather than promising less than it takes.
 */
export function readingTimeMinutes(html: string | null): number | null {
  if (!html) return null;
  const words = wordCount(html);
  if (words < MIN_WORDS) return null;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
