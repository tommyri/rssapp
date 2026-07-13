// Article-list density is an account preference, not a content preference: it
// changes scanning rows only. Expanded articles deliberately keep their roomy
// reading layout regardless of this choice.

export const ARTICLE_LIST_DENSITIES = ["comfortable", "compact"] as const;

export type ArticleListDensity = (typeof ARTICLE_LIST_DENSITIES)[number];

// Matches the original article-row styling so existing readers see no visual
// change until they explicitly choose the denser option.
export const DEFAULT_ARTICLE_LIST_DENSITY: ArticleListDensity = "comfortable";

export function isArticleListDensity(
  value: unknown,
): value is ArticleListDensity {
  return value === "comfortable" || value === "compact";
}

/** Tolerate missing, old, or malformed persisted user settings. */
export function normalizeArticleListDensity(
  value: unknown,
): ArticleListDensity {
  return isArticleListDensity(value) ? value : DEFAULT_ARTICLE_LIST_DENSITY;
}

export interface ArticleListDensityClasses {
  header: string;
  unreadDot: string;
  title: string;
  snippet: string;
  metadata: string;
}

const COMFORTABLE_CLASSES: ArticleListDensityClasses = {
  header: "gap-3 px-1 py-3.5",
  unreadDot: "mt-[7px]",
  title: "text-[15px] leading-snug",
  snippet: "mt-0.5 line-clamp-2 text-[13px] leading-normal",
  metadata: "mt-1 text-xs",
};

const COMPACT_CLASSES: ArticleListDensityClasses = {
  header: "gap-2 px-1 py-2",
  unreadDot: "mt-1.5",
  title: "text-sm leading-snug",
  snippet: "mt-px line-clamp-1 text-xs leading-snug",
  metadata: "mt-0.5 text-[11px] leading-tight",
};

/** Tailwind classes for a collapsed article row at the selected density. */
export function articleListDensityClasses(
  density: ArticleListDensity,
): ArticleListDensityClasses {
  return density === "compact" ? COMPACT_CLASSES : COMFORTABLE_CLASSES;
}
