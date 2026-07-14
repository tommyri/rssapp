import { describe, expect, it } from "vitest";
import { getBackupConfiguration } from "./backup-config";

describe("backup configuration", () => {
  it("stays disabled outside a configured server backup directory", () => {
    expect(getBackupConfiguration({})).toEqual({
      enabled: false,
      directory: null,
      intervalHours: 24,
      retention: 14,
    });
  });

  it("uses a configured directory and accepts bounded overrides", () => {
    expect(
      getBackupConfiguration({
        BACKUP_DIR: " /backups ",
        BACKUP_INTERVAL_HOURS: "12",
        BACKUP_RETENTION: "30",
      }),
    ).toEqual({
      enabled: true,
      directory: "/backups",
      intervalHours: 12,
      retention: 30,
    });
  });

  it("falls back for invalid scheduling values", () => {
    expect(
      getBackupConfiguration({
        BACKUP_DIR: "/backups",
        BACKUP_INTERVAL_HOURS: "0",
        BACKUP_RETENTION: "lots",
      }),
    ).toMatchObject({ intervalHours: 24, retention: 14 });
  });
});
