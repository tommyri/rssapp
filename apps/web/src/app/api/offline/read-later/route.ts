import { z } from "zod";
import { getCurrentUserId } from "@/lib/current-user";
import {
  type OfflineReadLaterAutoDownloadLimit,
  offlineArticlesFromReaderItems,
} from "@/lib/offline-library";
import { listReadLater } from "@/lib/reader";

export const runtime = "nodejs";

const automaticDownloadLimitSchema = z.union([
  z.literal(25),
  z.literal(50),
  z.literal(100),
]);

/** Provides a bounded automatic Read later set only to the signed-in worker. */
export async function GET(request: Request) {
  const limit = automaticDownloadLimitSchema.safeParse(
    Number(new URL(request.url).searchParams.get("limit")),
  );
  if (!limit.success) {
    return Response.json(
      { error: "Invalid automatic download limit" },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();
  const { items } = await listReadLater(userId);
  const articles = offlineArticlesFromReaderItems(
    userId,
    items,
    limit.data as OfflineReadLaterAutoDownloadLimit,
    "automatic",
  );
  return Response.json(
    { userId, articles },
    { headers: { "cache-control": "private, no-store" } },
  );
}
