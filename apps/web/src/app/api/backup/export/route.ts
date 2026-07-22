import { backupFilename, exportUserBackup } from "@/lib/backup";
import { getCurrentUserId } from "@/lib/current-user";

// The export reads Postgres and is intentionally a per-user, dynamic response.
export const runtime = "nodejs";

export async function GET() {
  const userId = await getCurrentUserId();
  const backup = await exportUserBackup(userId);
  const filename = backupFilename(userId, new Date());

  return new Response(`${JSON.stringify(backup, null, 2)}\n`, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
