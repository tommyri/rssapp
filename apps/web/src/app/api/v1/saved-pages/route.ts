import { after } from "next/server";
import { authenticateFirstPartyApiRequest } from "@/lib/api-v1-auth";
import {
  parseApiSavedPageCreateBody,
  parseApiSavedPageListQuery,
} from "@/lib/api-v1-input";
import { apiError, apiJson, apiUnauthorized } from "@/lib/api-v1-response";
import {
  createApiSavedPage,
  listApiSavedPages,
  runApiSavedPageExtraction,
} from "@/lib/api-v1-saved-pages";
import { spendSaveLinkBudget } from "@/lib/save-link-limit";
import { SAVE_LINK_LIMITED_MESSAGE } from "@/lib/save-link-notice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const query = parseApiSavedPageListQuery(new URL(request.url).searchParams);
  if (!query) {
    return apiError(
      "invalid_query",
      "Use a limit from 1 to 100 and a cursor returned by this endpoint.",
      400,
    );
  }

  return apiJson(await listApiSavedPages(principal.id, query));
}

export async function POST(request: Request) {
  const principal = await authenticateFirstPartyApiRequest(request);
  if (!principal) return apiUnauthorized();

  const json = await request.json().catch(() => null);
  const body = parseApiSavedPageCreateBody(json);
  if (!body) {
    return apiError("invalid_body", "Provide a url to save.", 400);
  }

  // The same ceiling the bookmark and the paste field spend from. Saving makes
  // the server fetch a URL someone else chose, so a share extension is no more
  // entitled to an unmetered fetcher than a bookmark is.
  const budget = await spendSaveLinkBudget(principal.id);
  if (budget.limited) {
    return apiError("save_limit_reached", SAVE_LINK_LIMITED_MESSAGE, 429, {
      "retry-after": String(budget.retryAfterSeconds),
    });
  }

  const result = await createApiSavedPage(principal.id, body.url);
  if (result.status === "invalid") {
    return apiError("invalid_url", result.message, 400);
  }

  // Answer before fetching the page. The reader is holding a share sheet open;
  // the copy arrives in the background and the scheduler sweep is the backstop.
  if (!result.alreadySaved) {
    const savedPageId = result.savedPageId;
    after(async () => {
      await runApiSavedPageExtraction(savedPageId);
    });
  }

  return apiJson(
    { data: { alreadySaved: result.alreadySaved, savedPage: result.page } },
    { status: result.alreadySaved ? 200 : 201 },
  );
}
