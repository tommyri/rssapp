import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { extractSavedPage, saveLink } from "@/lib/saved-pages";

/**
 * Bookmarklet endpoint: GET /save?url=<page> saves a link and bounces to the
 * Read later view. The proxy already requires a session; getCurrentUserId is
 * the defensive backstop. Extraction runs in the background (the scheduler
 * sweep catches anything that doesn't finish), so the redirect is instant.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  const url = request.nextUrl.searchParams.get("url");
  if (url) {
    const result = await saveLink(userId, url);
    if (result.ok && !result.alreadySaved) {
      void extractSavedPage(result.id).catch(() => {});
    }
  }
  redirect("/?view=later");
}
