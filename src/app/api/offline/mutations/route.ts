import { getOptionalUserId } from "@/lib/current-user";
import {
  type OfflineSyncMutation,
  offlineMutationPayloadSchema,
} from "@/lib/offline-mutation-payload";
import { setItemRead, setItemReadLater, setItemStarred } from "@/lib/reader";
import {
  extractSavedPage,
  saveLink,
  setSavedPageRead,
} from "@/lib/saved-pages";

export const runtime = "nodejs";

async function applyMutation(
  userId: number,
  mutation: OfflineSyncMutation,
): Promise<void> {
  if (mutation.kind === "save-link") {
    const result = await saveLink(userId, mutation.url);
    if (!result.ok) throw new Error(result.error);
    if (!result.alreadySaved) {
      try {
        await extractSavedPage(result.id);
      } catch {
        // The scheduled sweep will retry any page left pending.
      }
    }
    return;
  }

  if (mutation.kind === "page") {
    await setSavedPageRead(userId, mutation.itemId, mutation.value);
    return;
  }

  switch (mutation.field) {
    case "read":
      await setItemRead(userId, mutation.itemId, mutation.value);
      return;
    case "starred":
      await setItemStarred(userId, mutation.itemId, mutation.value);
      return;
    case "readLater":
      await setItemReadLater(userId, mutation.itemId, mutation.value);
  }
}

/** Service-worker-only replay endpoint. Identity is always derived from session. */
export async function POST(request: Request) {
  const userId = await getOptionalUserId();
  if (userId === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = offlineMutationPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid mutation payload" },
      { status: 400 },
    );
  }

  const applied: Array<{ key: string; token: string }> = [];
  for (const mutation of parsed.data.mutations) {
    // Do not let a different user's residual device data cross session bounds.
    if (mutation.userId !== userId) continue;
    await applyMutation(userId, mutation);
    applied.push({ key: mutation.key, token: mutation.token });
  }
  return Response.json({ applied });
}
