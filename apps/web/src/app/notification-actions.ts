"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/current-user";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

const notificationIdSchema = z.number().int().positive();

/** Read an alert before taking the reader to its article. */
export async function openNotificationAction(notificationId: number) {
  const parsed = notificationIdSchema.safeParse(notificationId);
  const userId = await getCurrentUserId();
  if (!parsed.success) redirect("/?view=notifications");

  await markNotificationRead(userId, parsed.data);
  revalidatePath("/");
  redirect(`/?view=notifications&notification=${parsed.data}`);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const userId = await getCurrentUserId();
  await markAllNotificationsRead(userId);
  revalidatePath("/");
}
