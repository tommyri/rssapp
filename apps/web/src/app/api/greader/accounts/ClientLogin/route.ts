import { authenticateApiAccessToken } from "@/lib/api-access-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreText(body: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(body, { ...init, headers });
}

/**
 * Legacy Google Reader login. `Passwd` is an app password created in Settings,
 * never the account password. This lets a native reader sync without receiving
 * browser-session authority.
 */
export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const email = String(formData?.get("Email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData?.get("Passwd") ?? "").trim();
  const principal = await authenticateApiAccessToken(password);

  if (!principal || principal.email.toLowerCase() !== email) {
    return noStoreText("Error=BadAuthentication\n", { status: 403 });
  }

  // Many older clients require all three keys, even though they use Auth for
  // subsequent requests. Auth intentionally echoes the supplied app password.
  return noStoreText(
    `SID=rssapp-${principal.id}\nLSID=rssapp-${principal.id}\nAuth=${password}\n`,
  );
}
