import { articleSnippet } from "@/lib/article-snippet";
import { readingTimeMinutes } from "@/lib/reading-time";

export interface ApiArticleSummary {
  /**
   * The plain-text snippet a list row shows under the title, or null when the
   * body has nothing worth previewing (a stub entry, a bare "Comments" link).
   */
  preview: string | null;
  /** Estimated minutes to read, or null when the body is too short to estimate. */
  readingTime: number | null;
}

/**
 * The two scanning facts a list row needs, derived on the server so native
 * clients don't parse HTML to draw a row — and so their rows say the same thing
 * the web's do.
 *
 * This deliberately delegates to the web's own row helpers rather than
 * reimplementing them: `articleSnippet` carries the boilerplate-stripping rules
 * (repeated publication dates, the title again, word-boundary truncation) and
 * `readingTimeMinutes` carries the 225 wpm and short-entry thresholds. Pass the
 * same HTML the web row uses — full extracted content when present, otherwise
 * the feed body — so both surfaces agree.
 */
export function apiArticleSummary(
  html: string | null,
  title: string | null,
): ApiArticleSummary {
  // The web renders an empty snippet as "no preview"; on the wire null says so
  // without a client having to treat "" as a special case.
  const preview = articleSnippet(html, title);
  return {
    preview: preview === "" ? null : preview,
    readingTime: readingTimeMinutes(html),
  };
}
