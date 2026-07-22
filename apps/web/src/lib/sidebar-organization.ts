import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { folders, subscriptions, users } from "@/db/schema";
import {
  readSidebarPreferences,
  type SidebarPreferences,
  sidebarFeedOrderKey,
} from "@/lib/sidebar-preferences";

function hasExactlyTheseIds(expected: number[], received: number[]): boolean {
  if (expected.length !== received.length) return false;
  const expectedIds = new Set(expected);
  const receivedIds = new Set(received);
  return (
    expectedIds.size === expected.length &&
    receivedIds.size === received.length &&
    [...expectedIds].every((id) => receivedIds.has(id))
  );
}

export async function listSidebarPreferences(
  userId: number,
): Promise<SidebarPreferences> {
  const [row] = await db
    .select({ settings: users.settings })
    .from(users)
    .where(eq(users.id, userId));
  return readSidebarPreferences(row?.settings);
}

/** Persist a collapsed/expanded choice only for one of the user's folders. */
export async function setFolderCollapsed(
  userId: number,
  folderId: number,
  collapsed: boolean,
): Promise<boolean> {
  const [[user], [folder]] = await Promise.all([
    db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId))),
  ]);
  if (!user || !folder) return false;

  const ids = new Set(readSidebarPreferences(user.settings).collapsedFolderIds);
  if (collapsed) ids.add(folderId);
  else ids.delete(folderId);

  await db
    .update(users)
    .set({
      settings: {
        ...user.settings,
        collapsedFolderIds: [...ids].sort((a, b) => a - b),
      },
    })
    .where(eq(users.id, userId));
  return true;
}

/** Save folder order only after verifying the client supplied all of them. */
export async function reorderFolders(
  userId: number,
  folderIds: number[],
): Promise<boolean> {
  const [[user], existing] = await Promise.all([
    db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select({ id: folders.id })
      .from(folders)
      .where(eq(folders.userId, userId)),
  ]);
  if (
    !user ||
    !hasExactlyTheseIds(
      existing.map((folder) => folder.id),
      folderIds,
    )
  ) {
    return false;
  }

  await db
    .update(users)
    .set({ settings: { ...user.settings, sidebarFolderIds: folderIds } })
    .where(eq(users.id, userId));
  return true;
}

/** Save feeds inside one folder (or the ungrouped feed list) in the user JSON. */
export async function reorderFeeds(
  userId: number,
  folderId: number | null,
  feedIds: number[],
): Promise<boolean> {
  if (folderId !== null) {
    const [folder] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)));
    if (!folder) return false;
  }

  const folderScope =
    folderId === null
      ? isNull(subscriptions.folderId)
      : eq(subscriptions.folderId, folderId);
  const [[user], existing] = await Promise.all([
    db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select({ feedId: subscriptions.feedId })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), folderScope)),
  ]);
  if (
    !user ||
    !hasExactlyTheseIds(
      existing.map((feed) => feed.feedId),
      feedIds,
    )
  ) {
    return false;
  }

  const preferences = readSidebarPreferences(user.settings);
  await db
    .update(users)
    .set({
      settings: {
        ...user.settings,
        sidebarFeedIds: {
          ...preferences.feedIdsByFolder,
          [sidebarFeedOrderKey(folderId)]: feedIds,
        },
      },
    })
    .where(eq(users.id, userId));
  return true;
}
