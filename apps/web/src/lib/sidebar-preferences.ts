export interface SidebarPreferences {
  collapsedFolderIds: number[];
  folderIds: number[];
  feedIdsByFolder: Record<string, number[]>;
}

function ids(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((id): id is number => Number.isInteger(id) && id > 0),
    ),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFeedOrderKey(key: string): boolean {
  return key === "ungrouped" || /^[1-9]\d*$/.test(key);
}

/** Read only valid sidebar preferences from the extensible user settings JSON. */
export function readSidebarPreferences(value: unknown): SidebarPreferences {
  const settings = isRecord(value) ? value : {};
  const rawFeedIds = isRecord(settings.sidebarFeedIds)
    ? settings.sidebarFeedIds
    : {};
  const feedIdsByFolder = Object.fromEntries(
    Object.entries(rawFeedIds).flatMap(([key, value]) => {
      const savedIds = ids(value);
      return isFeedOrderKey(key) && savedIds.length > 0
        ? [[key, savedIds]]
        : [];
    }),
  );

  return {
    collapsedFolderIds: ids(settings.collapsedFolderIds),
    folderIds: ids(settings.sidebarFolderIds),
    feedIdsByFolder,
  };
}

export function sidebarFeedOrderKey(folderId: number | null): string {
  return folderId === null ? "ungrouped" : String(folderId);
}

/** Put persisted ids first while retaining the source order for new entries. */
export function orderBySavedIds<T>(
  entries: readonly T[],
  savedIds: readonly number[],
  getId: (entry: T) => number,
): T[] {
  const byId = new Map(entries.map((entry) => [getId(entry), entry]));
  const seen = new Set<number>();
  const ordered: T[] = [];

  for (const id of savedIds) {
    const entry = byId.get(id);
    if (entry && !seen.has(id)) {
      ordered.push(entry);
      seen.add(id);
    }
  }

  return [...ordered, ...entries.filter((entry) => !seen.has(getId(entry)))];
}
