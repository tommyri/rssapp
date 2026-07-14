import {
  BackupRestoreError,
  parseBackupDocument,
  previewBackupRestore,
  previewCurrentReaderData,
  restoreBackup,
} from "@/lib/backup-restore";
import { BACKUP_RESTORE_MAX_BYTES } from "@/lib/backup-restore-config";
import { getOptionalUserId } from "@/lib/current-user";

export const runtime = "nodejs";

function noStoreJson(body: object, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

/** Keep the authenticated, destructive restore endpoint same-origin only. */
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

async function readBackupPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new BackupRestoreError("Choose a JSON backup file.");
  }

  const payload = await request.arrayBuffer();
  if (payload.byteLength > BACKUP_RESTORE_MAX_BYTES) {
    throw new BackupRestoreError("Backups must be 50 MB or smaller.");
  }

  try {
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    throw new BackupRestoreError("Choose a valid rssapp JSON backup file.");
  }
}

export async function POST(request: Request) {
  const userId = await getOptionalUserId();
  if (userId === null) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return noStoreJson(
      { error: "Restore requests must come from this app." },
      { status: 403 },
    );
  }

  const mode = new URL(request.url).searchParams.get("mode");
  if (mode !== "preview" && mode !== "restore") {
    return noStoreJson({ error: "Invalid restore request." }, { status: 400 });
  }

  try {
    const backup = parseBackupDocument(await readBackupPayload(request));
    if (mode === "preview") {
      const [preview, current] = await Promise.all([
        previewBackupRestore(backup),
        previewCurrentReaderData(userId),
      ]);
      return noStoreJson({ preview, current });
    }

    const restored = await restoreBackup(userId, backup);
    return noStoreJson({ restored });
  } catch (error) {
    if (error instanceof BackupRestoreError) {
      return noStoreJson({ error: error.message }, { status: 400 });
    }
    console.error("[backup] restore failed:", error);
    return noStoreJson(
      { error: "The backup could not be restored. Please try again." },
      { status: 500 },
    );
  }
}
