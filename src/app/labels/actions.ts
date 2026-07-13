"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/current-user";
import {
  createLabel,
  deleteLabel,
  renameLabel,
  setLabelAssignment,
} from "@/lib/labels";

const idSchema = z.number().int().positive();

export interface LabelActionState {
  ok: boolean;
  message: string;
}

function revalidateLabels(): void {
  revalidatePath("/");
  revalidatePath("/labels");
}

export async function createLabelAction(
  name: string,
): Promise<LabelActionState> {
  const userId = await getCurrentUserId();
  const result = await createLabel(userId, name);
  if (!result.ok) return { ok: false, message: result.error };
  revalidateLabels();
  return { ok: true, message: `Created “${result.label.name}”.` };
}

export async function renameLabelAction(
  labelId: number,
  name: string,
): Promise<LabelActionState> {
  if (!idSchema.safeParse(labelId).success) {
    return { ok: false, message: "Invalid label." };
  }
  const userId = await getCurrentUserId();
  const result = await renameLabel(userId, labelId, name);
  if (!result.ok) return { ok: false, message: result.error };
  revalidateLabels();
  return { ok: true, message: "Label renamed." };
}

export async function deleteLabelAction(labelId: number): Promise<void> {
  if (!idSchema.safeParse(labelId).success) return;
  const userId = await getCurrentUserId();
  await deleteLabel(userId, labelId);
  revalidateLabels();
}

export async function toggleItemLabelAction(
  itemId: number,
  labelId: number,
  assigned: boolean,
): Promise<boolean> {
  if (
    !idSchema.safeParse(itemId).success ||
    !idSchema.safeParse(labelId).success
  ) {
    return false;
  }
  const userId = await getCurrentUserId();
  const applied = await setLabelAssignment(
    userId,
    labelId,
    { kind: "item", itemId },
    assigned === true,
  );
  if (applied) revalidatePath("/");
  return applied;
}

export async function toggleSavedPageLabelAction(
  savedPageId: number,
  labelId: number,
  assigned: boolean,
): Promise<boolean> {
  if (
    !idSchema.safeParse(savedPageId).success ||
    !idSchema.safeParse(labelId).success
  ) {
    return false;
  }
  const userId = await getCurrentUserId();
  const applied = await setLabelAssignment(
    userId,
    labelId,
    { kind: "page", savedPageId },
    assigned === true,
  );
  if (applied) revalidatePath("/");
  return applied;
}
