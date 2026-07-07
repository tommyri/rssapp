"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import {
  setSubscriptionPaused,
  unsubscribe,
  updateSubscription,
} from "@/lib/subscriptions";

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
  const autoReadRaw = Number(formData.get("autoReadDays"));
  const autoReadDays =
    Number.isInteger(autoReadRaw) && autoReadRaw >= 1 && autoReadRaw <= 365
      ? autoReadRaw
      : null;
  const sortOrder =
    formData.get("sortOrder") === "oldest" ? "oldest" : "newest";
  const defaultUnreadOnly = formData.get("defaultUnreadOnly") === "on";

  const userId = await getCurrentUserId();
  await updateSubscription(userId, feedId, {
    customTitle,
    folderName,
    fullContent,
    autoReadDays,
    sortOrder,
    defaultUnreadOnly,
  });
  revalidatePath("/feeds");
  revalidatePath("/");
}

export async function setFeedPausedAction(formData: FormData): Promise<void> {
  const feedId = feedIdFrom(formData);
  if (feedId === null) return;

  const userId = await getCurrentUserId();
  await setSubscriptionPaused(userId, feedId, formData.get("paused") === "1");
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
