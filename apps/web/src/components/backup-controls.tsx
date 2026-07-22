import { DownloadIcon } from "lucide-react";
import { BackupRestoreControl } from "@/components/backup-restore-control";
import { getBackupConfiguration } from "@/lib/backup-config";

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground";

/** Portable data export plus the server snapshot status for self-hosted installs. */
export function BackupControls({ userId }: { userId: number }) {
  const backup = getBackupConfiguration();

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Complete backup</h3>
        <p className="text-xs text-muted-foreground">
          Download a portable JSON copy of your subscriptions, articles, reading
          state, saved pages, labels, rules, and highlights. It never includes
          your password.
        </p>
      </div>
      <a href="/api/backup/export" download className={buttonClass}>
        <DownloadIcon className="size-3.5" />
        Download JSON backup
      </a>
      <p className="text-xs text-muted-foreground">
        {backup.enabled
          ? `This server also writes a snapshot every ${backup.intervalHours} hour${backup.intervalHours === 1 ? "" : "s"} and keeps the latest ${backup.retention}.`
          : "Automatic server snapshots are not configured in this environment. The JSON download is always available."}
      </p>
      <BackupRestoreControl userId={userId} />
    </section>
  );
}
