// Reader typography preferences (docs/features.md v0.2): reader-adjustable text
// size, body font, and column width for the expanded article. Device-level and
// client-only — persisted to localStorage, applied as CSS custom properties the
// `.article-content` rules consume (see globals.css). Pure/db-free so the maps
// and parsing are unit-testable; the DOM application lives in the component.

export type ReaderFontSize = "small" | "medium" | "large";
export type ReaderFontFamily = "serif" | "sans";
export type ReaderWidth = "narrow" | "normal" | "wide";

export interface ReaderTypography {
  size: ReaderFontSize;
  family: ReaderFontFamily;
  width: ReaderWidth;
}

// Defaults match the pre-typography-controls .article-content styling, so a
// reader who never opens the setting sees exactly what they saw before.
export const DEFAULT_TYPOGRAPHY: ReaderTypography = {
  size: "medium",
  family: "serif",
  width: "normal",
};

export const READER_TYPOGRAPHY_KEY = "rssapp:readerTypography";

const FONT_SIZE: Record<ReaderFontSize, string> = {
  small: "0.9375rem",
  medium: "1.0625rem", // the previous fixed value
  large: "1.25rem",
};

const FONT_FAMILY: Record<ReaderFontFamily, string> = {
  serif: "var(--font-serif), Georgia, serif",
  sans: "var(--font-sans), system-ui, sans-serif",
};

const WIDTH: Record<ReaderWidth, string> = {
  narrow: "52ch",
  normal: "65ch", // matches the previous max-w-prose
  wide: "78ch",
};

/** The `.article-content` CSS custom properties for a typography choice. */
export function typographyVars(t: ReaderTypography): Record<string, string> {
  return {
    "--reader-font-size": FONT_SIZE[t.size],
    "--reader-font-family": FONT_FAMILY[t.family],
    "--reader-measure": WIDTH[t.width],
  };
}

const isSize = (v: unknown): v is ReaderFontSize =>
  v === "small" || v === "medium" || v === "large";
const isFamily = (v: unknown): v is ReaderFontFamily =>
  v === "serif" || v === "sans";
const isWidth = (v: unknown): v is ReaderWidth =>
  v === "narrow" || v === "normal" || v === "wide";

/**
 * Parse a stored preference, falling back to the default per field. Tolerates
 * null, malformed JSON, and partial/old shapes so a bad localStorage value can
 * never break the reader — it just reverts that field to its default.
 */
export function parseTypography(raw: string | null): ReaderTypography {
  if (!raw) return DEFAULT_TYPOGRAPHY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
  const v = (parsed ?? {}) as Record<string, unknown>;
  return {
    size: isSize(v.size) ? v.size : DEFAULT_TYPOGRAPHY.size,
    family: isFamily(v.family) ? v.family : DEFAULT_TYPOGRAPHY.family,
    width: isWidth(v.width) ? v.width : DEFAULT_TYPOGRAPHY.width,
  };
}
