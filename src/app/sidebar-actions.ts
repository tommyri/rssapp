"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import {
  reorderFeeds,
  reorderFolders,
  setFolderCollapsed,
} from "@/lib/sidebar-organization";

function validIds(ids: number[]): boolean {
  return (
    Array.isArray(ids) &&
    ids.length === new Set(ids).size &&
    ids.every((id) => Number.isInteger(id) && id > 0)
  );
}

export async function setFolderCollapsedAction(
  folderId: number,
  collapsed: boolean,
): Promise<boolean> {
  if (
    !Number.isInteger(folderId) ||
    folderId <= 0 ||
    typeof collapsed !== "boolean"
  ) {
    return false;
  }

  const userId = await getCurrentUserId();
  const updated = await setFolderCollapsed(userId, folderId, collapsed);
  if (updated) revalidatePath("/");
  return updated;
}

export async function reorderFoldersAction(
  folderIds: number[],
): Promise<boolean> {
  if (!validIds(folderIds)) return false;

  const userId = await getCurrentUserId();
  const updated = await reorderFolders(userId, folderIds);
  if (updated) revalidatePath("/");
  return updated;
}

export async function reorderFeedsAction(
  folderId: number | null,
  feedIds: number[],
): Promise<boolean> {
  if (
    (folderId !== null && (!Number.isInteger(folderId) || folderId <= 0)) ||
    !validIds(feedIds)
  ) {
    return false;
  }

  const userId = await getCurrentUserId();
  const updated = await reorderFeeds(userId, folderId, feedIds);
  if (updated) revalidatePath("/");
  return updated;
}
