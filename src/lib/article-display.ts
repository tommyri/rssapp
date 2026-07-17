/** An audio enclosure is independently readable even when a feed has no body. */
export function hasExpandedArticleContent(
  contentHtml: string | null,
  audioUrl: string | null,
): boolean {
  return contentHtml !== null || audioUrl !== null;
}
