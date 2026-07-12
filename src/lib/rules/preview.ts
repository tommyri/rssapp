import { type MatchableItem, type RuleSpec, ruleMatches } from "./engine";

export interface RulePreviewCandidate extends MatchableItem {
  id: number;
  feedTitle: string | null;
  publishedAt: Date | null;
}

export interface RulePreviewMatch {
  id: number;
  title: string | null;
  author: string | null;
  feedTitle: string | null;
  publishedAt: string | null;
}

/** The safe, UI-sized projection of candidates that a draft rule would match. */
export function rulePreviewMatches(
  rule: RuleSpec,
  candidates: RulePreviewCandidate[],
): RulePreviewMatch[] {
  return candidates
    .filter((item) => ruleMatches(rule, item))
    .map((item) => ({
      id: item.id,
      title: item.title,
      author: item.author,
      feedTitle: item.feedTitle,
      publishedAt: item.publishedAt?.toISOString() ?? null,
    }));
}
