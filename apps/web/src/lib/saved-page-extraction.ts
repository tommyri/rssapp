export type SavedPageExtractionStatus = "pending" | "ready" | "error";

export interface SavedPageExtractionSnapshot {
  id: number;
  status: SavedPageExtractionStatus;
  error: string | null;
  title: string | null;
  author: string | null;
  feedTitle: string | null;
  contentHtml: string | null;
}

export const SAVED_PAGE_POLL_DELAYS_MS = [1_000, 1_500, 2_500, 5_000, 10_000];
export const SAVED_PAGE_POLL_MAX_DURATION_MS = 120_000;

function isStatus(value: unknown): value is SavedPageExtractionStatus {
  return value === "pending" || value === "ready" || value === "error";
}

export function parseSavedPageExtractionSnapshot(
  value: unknown,
): SavedPageExtractionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(snapshot.id) ||
    !isStatus(snapshot.status) ||
    (snapshot.title !== null && typeof snapshot.title !== "string") ||
    (snapshot.feedTitle !== null && typeof snapshot.feedTitle !== "string") ||
    (snapshot.error !== null && typeof snapshot.error !== "string") ||
    (snapshot.author !== null && typeof snapshot.author !== "string") ||
    (snapshot.contentHtml !== null && typeof snapshot.contentHtml !== "string")
  ) {
    return null;
  }
  return snapshot as unknown as SavedPageExtractionSnapshot;
}
