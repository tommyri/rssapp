// Fuzzy matching for the command palette (docs/features.md v0.2). A greedy
// case-insensitive subsequence matcher — enough for a personal reader's ~dozens
// of feeds, no dependency needed. Pure and db-free so it's unit-testable.

export interface FuzzyResult {
  /** Higher is better. Comparable only across candidates for the same query. */
  score: number;
  /** Indices into the original text of the matched characters, for highlighting. */
  indices: number[];
}

const SEPARATORS = /[\s\-_/.:]/;

/**
 * Match `query` as a subsequence of `text`. Word-start hits score highest,
 * runs of consecutive hits next, scattered hits least; shorter texts win ties
 * so "Rules" outranks "Rules of the internet" for "rules". Spaces in the query
 * are ignored (they separate words, they don't match anything). Returns null
 * when the query isn't a subsequence; an empty query matches with score 0.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (q === "") return { score: 0, indices: [] };
  const t = text.toLowerCase();

  const indices: number[] = [];
  let score = 0;
  let from = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at === -1) return null;
    if (at === 0 || SEPARATORS.test(t[at - 1])) {
      score += 3; // word start
    } else if (indices.length > 0 && at === indices[indices.length - 1] + 1) {
      score += 2; // continues a run
    } else {
      score += 1; // scattered
    }
    indices.push(at);
    from = at + 1;
  }
  // Character scores dominate; text length only breaks ties.
  return { score: score * 100 - text.length, indices };
}
