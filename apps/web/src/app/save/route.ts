import { redirect } from "next/navigation";
import { after, type NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";
import { consumeSaveLinkBudget } from "@/lib/save-link-limit";
import {
  SAVE_LINK_LIMITED_PARAM,
  SAVE_LINK_LIMITED_VALUE,
} from "@/lib/save-link-notice";
import { extractSavedPage, saveLink } from "@/lib/saved-pages";

const READ_LATER = "/?view=later";

/**
 * Bookmarklet endpoint: GET /save?url=<page> saves a link and bounces to the
 * Read later view. The proxy already requires a session; getCurrentUserId is
 * the defensive backstop. Extraction runs in the background (the scheduler
 * sweep catches anything that doesn't finish), so the redirect is instant.
 *
 * A state-changing GET is the point here — a bookmark can only navigate — which
 * also means another site can send a signed-in reader through it. The budget
 * below is what stops that, and deliberate scripted abuse, from turning the
 * reader into an unmetered fetcher for whatever URL someone picks.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  const url = request.nextUrl.searchParams.get("url");
  if (url) {
    if (!(await consumeSaveLinkBudget(userId))) {
      // Still land in the reader: a bookmark has nowhere else to go, and the
      // Read later view explains what happened.
      redirect(
        `${READ_LATER}&${SAVE_LINK_LIMITED_PARAM}=${SAVE_LINK_LIMITED_VALUE}`,
      );
    }
    const result = await saveLink(userId, url);
    if (result.ok && !result.alreadySaved) {
      after(async () => {
        await extractSavedPage(result.id).catch(() => {});
      });
    }
  }
  redirect(READ_LATER);
}
