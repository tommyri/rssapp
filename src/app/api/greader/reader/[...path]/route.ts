import { authenticateGReaderRequest } from "@/lib/greader-auth";
import {
  decodeGReaderContinuation,
  GOOGLE_READER_READING_LIST,
  parseGoogleReaderItemId,
  parseGReaderLimit,
  parseGReaderStream,
  parseGReaderTimestamp,
} from "@/lib/greader-protocol";
import {
  deleteGReaderTag,
  editGReaderSubscription,
  editGReaderTags,
  listGReaderItemsById,
  listGReaderStream,
  listGReaderStreamItemIds,
  listGReaderSubscriptions,
  listGReaderTags,
  listGReaderUnreadCounts,
  markGReaderStreamRead,
  quickAddGReaderSubscription,
  renameGReaderTag,
} from "@/lib/greader-sync";
import { generateOpml } from "@/lib/opml/generate";
import { subscriptionsForExport } from "@/lib/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

function noStoreJson(body: object, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function noStoreText(body: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(body, { ...init, headers });
}

function noStoreOpml(body: string): Response {
  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

function unknownEndpoint(): Response {
  return noStoreJson(
    { error: "Unsupported Google Reader endpoint." },
    { status: 404 },
  );
}

async function authenticate(request: Request) {
  const principal = await authenticateGReaderRequest(request);
  return principal ?? null;
}

function endpointPath(path: string[]): string | null {
  if (path[0] !== "api" || path[1] !== "0") return null;
  return path.slice(2).join("/");
}

function streamFromRequest(value: string | null) {
  return parseGReaderStream(value ?? GOOGLE_READER_READING_LIST);
}

function itemIds(values: FormDataEntryValue[]): number[] {
  return values
    .map((value) => parseGoogleReaderItemId(String(value)))
    .filter((id): id is number => id !== null);
}

export async function GET(request: Request, context: Context) {
  const principal = await authenticate(request);
  if (!principal) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await context.params;
  const endpoint = endpointPath(path);
  if (!endpoint) return unknownEndpoint();
  const url = new URL(request.url);

  if (endpoint === "token") {
    // The auth header is the actual protection. A non-empty token keeps legacy
    // clients that insist on this endpoint compatible without adding CSRF state.
    return noStoreJson({ token: "rssapp" });
  }
  if (endpoint === "user-info") {
    return noStoreJson({
      userId: String(principal.id),
      userName: principal.displayName ?? principal.email,
      userEmail: principal.email,
      userProfileId: principal.email,
    });
  }
  if (endpoint === "subscription/list") {
    return noStoreJson(await listGReaderSubscriptions(principal.id));
  }
  if (endpoint === "unread-count") {
    return noStoreJson(await listGReaderUnreadCounts(principal.id));
  }
  if (endpoint === "tag/list") {
    return noStoreJson(await listGReaderTags(principal.id));
  }
  if (endpoint === "preference/list") {
    return noStoreJson({ streamprefs: {}, prefs: {} });
  }
  if (endpoint === "preference/stream/list") {
    return noStoreJson({ streamprefs: {} });
  }
  if (endpoint === "friend/list") {
    return noStoreJson({ friends: [] });
  }
  if (endpoint === "subscription/export") {
    const entries = await subscriptionsForExport(principal.id);
    return noStoreOpml(generateOpml("rssapp subscriptions", entries));
  }
  if (endpoint.startsWith("stream/contents/")) {
    const stream = streamFromRequest(endpoint.slice("stream/contents/".length));
    if (!stream)
      return noStoreJson({ error: "Unknown stream." }, { status: 400 });
    return noStoreJson(
      await listGReaderStream(principal.id, {
        stream,
        limit: parseGReaderLimit(url.searchParams.get("n")),
        continuation: decodeGReaderContinuation(url.searchParams.get("c")),
        oldest: url.searchParams.get("r") === "o",
        newerThan: parseGReaderTimestamp(url.searchParams.get("ot")),
        excludeTags: new Set(url.searchParams.getAll("xt")),
      }),
    );
  }
  if (endpoint === "stream/items/ids") {
    const stream = streamFromRequest(url.searchParams.get("s"));
    if (!stream)
      return noStoreJson({ error: "Unknown stream." }, { status: 400 });
    return noStoreJson(
      await listGReaderStreamItemIds(principal.id, {
        stream,
        limit: parseGReaderLimit(url.searchParams.get("n")),
        continuation: decodeGReaderContinuation(url.searchParams.get("c")),
        oldest: url.searchParams.get("r") === "o",
        newerThan: parseGReaderTimestamp(url.searchParams.get("ot")),
        excludeTags: new Set(url.searchParams.getAll("xt")),
      }),
    );
  }
  if (endpoint === "stream/items/contents") {
    const ids = url.searchParams
      .getAll("i")
      .map(parseGoogleReaderItemId)
      .filter((id): id is number => id !== null);
    return noStoreJson({
      items: await listGReaderItemsById(principal.id, ids),
    });
  }
  return unknownEndpoint();
}

export async function POST(request: Request, context: Context) {
  const principal = await authenticate(request);
  if (!principal) {
    return noStoreText("Unauthorized\n", { status: 401 });
  }
  const { path } = await context.params;
  const endpoint = endpointPath(path);
  if (!endpoint) return unknownEndpoint();
  const formData = await request.formData().catch(() => null);
  if (!formData) return noStoreText("Invalid request.\n", { status: 400 });

  if (endpoint === "edit-tag") {
    await editGReaderTags(principal.id, {
      itemIds: itemIds(formData.getAll("i")),
      add: formData.getAll("a").map(String),
      remove: formData.getAll("r").map(String),
    });
    return noStoreText("OK\n");
  }
  if (endpoint === "mark-all-as-read") {
    const stream = streamFromRequest(String(formData.get("s") ?? ""));
    if (!stream) return noStoreText("Unknown stream.\n", { status: 400 });
    await markGReaderStreamRead(
      principal.id,
      stream,
      parseGReaderTimestamp(String(formData.get("ts") ?? "")),
    );
    return noStoreText("OK\n");
  }
  if (endpoint === "subscription/quickadd") {
    const quickadd = String(formData.get("quickadd") ?? "").trim();
    if (!quickadd)
      return noStoreJson({ error: "A feed URL is required." }, { status: 400 });
    try {
      return noStoreJson(
        await quickAddGReaderSubscription(principal.id, quickadd),
      );
    } catch (error) {
      console.error("[greader] quick add failed:", error);
      return noStoreJson(
        { error: "Could not add that feed." },
        { status: 400 },
      );
    }
  }
  if (endpoint === "subscription/edit") {
    const edited = await editGReaderSubscription(principal.id, {
      streamId: String(formData.get("s") ?? ""),
      action: String(formData.get("ac") ?? ""),
      title: formData.has("t") ? String(formData.get("t") ?? "") : null,
      addCategories: formData.getAll("a").map(String),
      removeCategories: formData.getAll("r").map(String),
    });
    return edited
      ? noStoreText("OK\n")
      : noStoreText("Unknown subscription.\n", { status: 404 });
  }
  if (endpoint === "disable-tag") {
    const deleted = await deleteGReaderTag(
      principal.id,
      String(formData.get("s") ?? ""),
    );
    return deleted
      ? noStoreText("OK\n")
      : noStoreText("Unknown tag.\n", { status: 404 });
  }
  if (endpoint === "rename-tag") {
    const renamed = await renameGReaderTag(
      principal.id,
      String(formData.get("s") ?? ""),
      String(formData.get("dest") ?? ""),
    );
    return renamed
      ? noStoreText("OK\n")
      : noStoreText("Unknown tag.\n", { status: 404 });
  }
  return unknownEndpoint();
}
