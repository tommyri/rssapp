/** Focus mode is meaningful only while an article is expanded. */
export function readerFocusActive(
  requested: boolean,
  hasExpandedArticle: boolean,
): boolean {
  return requested && hasExpandedArticle;
}
