"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import { unsubscribe, updateSubscription } from "@/lib/subscriptions";

function feedIdFrom(formData: FormData): number | null {
  const id = Number(formData.get("feedId"));
  return Number.isInteger(id) ? id : null;
}

export async function updateFeedAction(formData: FormData): Promise<void> {
  const feedId = feedIdFrom(formData);
  if (feedId === null) return;

  const customTitle = String(formData.get("title") ?? "").trim() || null;
  const folderName = String(formData.get("folder") ?? "").trim() || null;
  const fullContent = formData.get("fullContent") === "on";

  const userId = await getCurrentUserId();
  await updateSubscription(userId, feedId, {
    customTitle,
    folderName,
    fullContent,
  });
  revalidatePath("/feeds");
  revalidatePath("/");
}

export async function unsubscribeAction(formData: FormData): Promise<void> {
  const feedId = feedIdFrom(formData);
  if (feedId === null) return;

  const userId = await getCurrentUserId();
  await unsubscribe(userId, feedId);
  revalidatePath("/feeds");
  revalidatePath("/");
}
