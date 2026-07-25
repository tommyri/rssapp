const SNIPPET_MAX_CHARS = 220;
/** Below this there is nothing worth previewing (e.g. HN's bare "Comments"). */
const SNIPPET_MIN_CHARS = 40;

/**
 * A publication date the feed repeated inside the body. The row's own meta line
 * already shows one, so leading with it costs a line of scanning and tells the
 * reader nothing. Covers "25th July 2026", "July 24, 2026", and the
 * "written on"/"posted on" prefixes feeds put in front of them.
 */
const LEADING_DATE =
  /^(?:written|posted|published)?\s*(?:on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+[a-zà-ÿ]+\s+\d{4}|[a-zà-ÿ]+\s+\d{1,2},?\s+\d{4})\s*(?:[-–—|·:]\s*)?/i;

/** Tag stripping leaves a space before punctuation: "SMBC , Oglaf" → "SMBC, Oglaf". */
function tidyPunctuation(text: string): string {
  return text.replace(/\s+([,.;:!?)\]])/g, "$1").replace(/([([])\s+/g, "$1");
}

/** Cut on a word boundary so a preview never ends mid-word ("…xkcd.c"). */
function truncateOnWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  // A single word longer than the limit has no boundary to fall back on.
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * The one-or-two line preview under a row's title, derived from stored
 * (already sanitized) HTML.
 *
 * Feeds put a lot of non-article text in the body — repeated publication dates,
 * the title again, tag and comment footers. Anything removed here is either
 * shown elsewhere on the row or is not article prose. What this deliberately
 * does *not* try to do is second-guess a feed whose posts genuinely are link
 * lists; guessing there would drop real content.
 */
export function articleSnippet(
  html: string | null,
  title: string | null,
): string {
  const text = tidyPunctuation(
    (html ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (!text) return "";

  let preview = text.replace(LEADING_DATE, "").trimStart();
  const trimmedTitle = title?.trim();
  if (
    trimmedTitle &&
    preview.toLowerCase().startsWith(trimmedTitle.toLowerCase())
  ) {
    // The title is directly above; repeating it wastes the preview.
    preview = preview.slice(trimmedTitle.length).replace(/^[\s.,:;–—-]+/, "");
  }

  if (preview.length < SNIPPET_MIN_CHARS || preview === trimmedTitle) return "";
  return truncateOnWord(preview, SNIPPET_MAX_CHARS);
}
