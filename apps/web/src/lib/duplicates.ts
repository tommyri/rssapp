// Pure display helpers for the duplicate-collapsing reader (docs/features.md
// v0.2). Kept db-free and separate from reader.ts so they're unit-testable.

/**
 * Distinct titles of the *other* feeds a story arrived in: the array_agg of a
 * collapsed group's feed titles with this row's own feed dropped, and blanks
 * and repeats removed. Drives the "also in …" row marker.
 */
export function otherFeedTitles(
  all: readonly (string | null)[] | null,
  own: string | null,
): string[] {
  const set = new Set<string>();
  for (const title of all ?? []) {
    if (title && title !== own) set.add(title);
  }
  return [...set];
}

/** "also in" label for a collapsed duplicate; names up to two feeds, then "+N". */
export function alsoInLabel(titles: readonly string[]): string {
  if (titles.length <= 2) return titles.join(", ");
  return `${titles.slice(0, 2).join(", ")} +${titles.length - 2}`;
}
