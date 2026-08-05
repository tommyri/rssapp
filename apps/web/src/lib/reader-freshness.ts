import type { ReaderItem } from "@/lib/reader";

export const READER_FRESHNESS_INTERVAL_MS = 60_000;
export const READER_RETURN_MINIMUM_MS = 5_000;

const readerItemKey = (item: Pick<ReaderItem, "kind" | "id">) =>
  `${item.kind}:${item.id}`;

function sameStringArray(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameLabels(
  left: ReaderItem["labels"],
  right: ReaderItem["labels"],
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every(
    (label, index) =>
      label.id === right[index]?.id && label.name === right[index]?.name,
  );
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function sameFreshItem(left: ReaderItem, right: ReaderItem): boolean {
  return (
    left.kind === right.kind &&
    left.id === right.id &&
    left.title === right.title &&
    left.url === right.url &&
    left.author === right.author &&
    left.contentHtml === right.contentHtml &&
    left.fullContentHtml === right.fullContentHtml &&
    left.fullContentStatus === right.fullContentStatus &&
    left.audioUrl === right.audioUrl &&
    left.audioType === right.audioType &&
    sameDate(left.publishedAt, right.publishedAt) &&
    sameDate(left.sortTs, right.sortTs) &&
    left.feedId === right.feedId &&
    left.feedTitle === right.feedTitle &&
    left.read === right.read &&
    left.starred === right.starred &&
    left.readLater === right.readLater &&
    left.readingProgress === right.readingProgress &&
    left.dupCount === right.dupCount &&
    sameStringArray(left.dupFeedTitles, right.dupFeedTitles) &&
    left.pageStatus === right.pageStatus &&
    left.pageError === right.pageError &&
    sameLabels(left.labels, right.labels)
  );
}

function mergeFreshItem(
  current: ReaderItem,
  fresh: ReaderItem,
  preserveReaderState: boolean,
): ReaderItem {
  const next = {
    ...fresh,
    ...(preserveReaderState
      ? {
          read: current.read,
          starred: current.starred,
          readLater: current.readLater,
        }
      : {}),
    // Route refreshes should not rewind active local playback or reading.
    readingProgress: current.readingProgress ?? fresh.readingProgress,
    audioProgress: {
      ...fresh.audioProgress,
      ...current.audioProgress,
    },
  };
  return sameFreshItem(current, next) ? current : next;
}

function sortsAfterBoundary(
  item: ReaderItem,
  boundary: ReaderItem,
  oldestFirst: boolean,
): boolean {
  const itemTime = item.sortTs.getTime();
  const boundaryTime = boundary.sortTs.getTime();
  if (itemTime !== boundaryTime) {
    return oldestFirst ? itemTime > boundaryTime : itemTime < boundaryTime;
  }
  return oldestFirst ? item.id > boundary.id : item.id < boundary.id;
}

/**
 * Where a kept row belongs once it has left the fresh page — directly after
 * whichever of the rows above it is still on screen, which is exactly where the
 * reader last saw it. Appending it instead would drop it to the end of the
 * loaded list, moving the article out from under someone who is reading it.
 * Kept rows are inserted in on-screen order, so consecutive kept rows chain:
 * each anchors on the one inserted just before it.
 */
function keptRowPosition(
  current: readonly ReaderItem[],
  reconciled: readonly ReaderItem[],
  keptRow: ReaderItem,
): number {
  const keptKey = readerItemKey(keptRow);
  const positions = new Map(
    reconciled.map((item, index) => [readerItemKey(item), index]),
  );
  const originalIndex = current.findIndex(
    (item) => readerItemKey(item) === keptKey,
  );

  for (let above = originalIndex - 1; above >= 0; above -= 1) {
    const neighbour = current[above];
    if (neighbour === undefined) continue;
    const position = positions.get(readerItemKey(neighbour));
    if (position !== undefined) return position + 1;
  }
  // Nothing above it survived, so it was — and stays — the first row.
  return 0;
}

export interface ReaderSnapshotOptions {
  freshHasMore: boolean;
  oldestFirst: boolean;
  preserveMissing: boolean;
  protectedKey: string | null;
  pendingStateKeys: ReadonlySet<string>;
  /**
   * Rows the reader marked read while this view has been mounted. An
   * unread-only snapshot no longer returns them, but removing them
   * mid-session would pull finished posts out from under the reader — they
   * stay in place until navigating away or reloading remounts the list.
   */
  sessionReadKeys: ReadonlySet<string>;
  unreadOnly: boolean;
  starredOnly: boolean;
  readLaterOnly: boolean;
}

/**
 * Reconcile a fresh server-rendered first page into the live client list.
 *
 * The incoming page is authoritative inside its keyset boundary. Older pages
 * already loaded by the reader stay mounted, and an open row is never removed
 * underneath someone who is reading it.
 */
export function reconcileReaderSnapshot(
  current: ReaderItem[],
  fresh: readonly ReaderItem[],
  options: ReaderSnapshotOptions,
): ReaderItem[] {
  const currentByKey = new Map(
    current.map((item) => [readerItemKey(item), item]),
  );
  const freshKeys = new Set(fresh.map(readerItemKey));
  const boundary = fresh.at(-1);
  const freshCoversAll = !options.freshHasMore;

  const reconciled = fresh.map((item) => {
    const key = readerItemKey(item);
    const existing = currentByKey.get(key);
    return existing
      ? mergeFreshItem(existing, item, options.pendingStateKeys.has(key))
      : item;
  });

  // Rows kept inside the fresh page's range are placed last, because where
  // each goes depends on which of its neighbours survived the fresh page.
  const keptRows: ReaderItem[] = [];

  for (const item of current) {
    const key = readerItemKey(item);
    if (freshKeys.has(key)) continue;

    const outsideFreshPage =
      boundary !== undefined &&
      sortsAfterBoundary(item, boundary, options.oldestFirst);
    const shouldPreserve =
      options.preserveMissing ||
      options.pendingStateKeys.has(key) ||
      options.protectedKey === key ||
      (options.unreadOnly && options.sessionReadKeys.has(key)) ||
      (!freshCoversAll && outsideFreshPage);
    if (!shouldPreserve) continue;

    if (outsideFreshPage) {
      reconciled.push(item);
    } else if (options.protectedKey === key) {
      // The open row left the view for a reason its local state may not know
      // about yet (read on another client, unstarred, …) — reflect it.
      keptRows.push({
        ...item,
        ...(options.unreadOnly ? { read: true } : {}),
        ...(options.starredOnly ? { starred: false } : {}),
        ...(options.readLaterOnly && item.kind === "item"
          ? { readLater: false }
          : {}),
      });
    } else {
      keptRows.push(item);
    }
  }

  for (const keptRow of keptRows) {
    reconciled.splice(
      keptRowPosition(current, reconciled, keptRow),
      0,
      keptRow,
    );
  }

  const same =
    reconciled.length === current.length &&
    reconciled.every((item, index) => item === current[index]);
  return same ? current : reconciled;
}
