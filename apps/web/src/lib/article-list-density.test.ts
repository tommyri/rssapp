import { describe, expect, it } from "vitest";
import {
  articleListDensityClasses,
  DEFAULT_ARTICLE_LIST_DENSITY,
  isArticleListDensity,
  normalizeArticleListDensity,
} from "./article-list-density";

describe("article-list density", () => {
  it("keeps the historical comfortable density as the default", () => {
    expect(normalizeArticleListDensity(undefined)).toBe(
      DEFAULT_ARTICLE_LIST_DENSITY,
    );
    expect(articleListDensityClasses(DEFAULT_ARTICLE_LIST_DENSITY)).toEqual({
      header: "gap-3 px-1 py-3.5",
      unreadDot: "mt-[7px]",
      title: "text-[15px] leading-snug",
      snippet: "mt-0.5 line-clamp-2 text-[13px] leading-normal",
      metadata: "mt-1 text-xs",
    });
  });

  it("recognizes only the supported persisted values", () => {
    expect(isArticleListDensity("compact")).toBe(true);
    expect(isArticleListDensity("comfortable")).toBe(true);
    expect(isArticleListDensity("dense")).toBe(false);
    expect(normalizeArticleListDensity("dense")).toBe("comfortable");
  });

  it("reduces both row spacing and preview length in compact mode", () => {
    expect(articleListDensityClasses("compact")).toEqual({
      header: "gap-2 px-1 py-2",
      unreadDot: "mt-1.5",
      title: "text-sm leading-snug",
      snippet: "mt-px line-clamp-1 text-xs leading-snug",
      metadata: "mt-0.5 text-[11px] leading-tight",
    });
  });
});
