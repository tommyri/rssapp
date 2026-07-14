const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_RETENTION = 14;

export interface BackupConfiguration {
  enabled: boolean;
  directory: string | null;
  intervalHours: number;
  retention: number;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum
    ? parsed
    : fallback;
}

/** Parse server-only backup settings without exposing a filesystem path to clients. */
export function getBackupConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): BackupConfiguration {
  const directory = environment.BACKUP_DIR?.trim() || null;
  return {
    enabled: directory !== null,
    directory,
    intervalHours: positiveInteger(
      environment.BACKUP_INTERVAL_HOURS,
      DEFAULT_INTERVAL_HOURS,
      24 * 365,
    ),
    retention: positiveInteger(
      environment.BACKUP_RETENTION,
      DEFAULT_RETENTION,
      365,
    ),
  };
}
