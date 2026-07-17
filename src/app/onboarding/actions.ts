"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUserId } from "@/lib/current-user";

export interface OnboardingActionState {
  ok: boolean;
  message: string;
}

const nameSchema = z.string().trim().max(80);

export async function completeOnboardingAction(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const rawName = String(formData.get("displayName") ?? "");
  const name = nameSchema.safeParse(rawName);
  if (!name.success) {
    return { ok: false, message: "Your name can be at most 80 characters." };
  }

  const userId = await getCurrentUserId();
  await db
    .update(users)
    .set({
      displayName: name.data || null,
      onboardingCompletedAt: new Date(),
    })
    .where(eq(users.id, userId));

  redirect("/");
}
