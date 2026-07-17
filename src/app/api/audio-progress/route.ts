import { parseAudioProgressInput } from "@/lib/audio-progress-input";
import { getOptionalUserId } from "@/lib/current-user";
import { setItemAudioProgress } from "@/lib/reader";

export const runtime = "nodejs";

function noStoreJson(body: object, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

/** Progress writes carry session cookies, so accept them only from this app. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const requestUrl = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    requestUrl.host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    requestUrl.protocol.replace(/:$/, "");

  return origin === `${protocol}://${host}`;
}

/**
 * Native media callbacks use a regular same-origin request rather than a
 * server action. `fetch(..., { keepalive: true })` can then finish this small
 * write while the reader navigates away or closes.
 */
export async function POST(request: Request) {
  const userId = await getOptionalUserId();
  if (userId === null) {
    return noStoreJson({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return noStoreJson(
      { ok: false, error: "Audio progress requests must come from this app." },
      { status: 403 },
    );
  }

  const input = parseAudioProgressInput(await request.json().catch(() => null));
  if (!input) {
    return noStoreJson(
      { ok: false, error: "Invalid audio progress." },
      { status: 400 },
    );
  }

  const saved = await setItemAudioProgress(
    userId,
    input.itemId,
    input.audioUrl,
    input.progress,
  );
  return noStoreJson({ ok: saved }, { status: saved ? 200 : 404 });
}
