import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { BACKUP_RESTORE_MAX_BODY_SIZE } from "./lib/backup-restore-config";

describe("backup restore request limit", () => {
  it("allows the largest backup accepted by the restore route through proxy", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(
      BACKUP_RESTORE_MAX_BODY_SIZE,
    );
  });
});
