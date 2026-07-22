"use server";

import { redirect } from "next/navigation";
import { verifyDigestUnsubscribeToken } from "@/lib/notification-digest-links";
import { disableNotificationDigests } from "@/lib/notification-digests";

export async function unsubscribeNotificationDigestAction(
  formData: FormData,
): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const entitlement = verifyDigestUnsubscribeToken(token);
  if (!entitlement) {
    redirect("/email-digests/unsubscribe?invalid=1");
  }
  await disableNotificationDigests(entitlement.userId);
  redirect("/email-digests/unsubscribed");
}
