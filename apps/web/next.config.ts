import { resolve } from "node:path";
import type { NextConfig } from "next";
import { BACKUP_RESTORE_MAX_BODY_SIZE } from "./src/lib/backup-restore-config";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (docs/tech-stack.md).
  output: "standalone",
  // The standalone trace must include workspace dependencies from the
  // monorepo root, not only files below apps/web.
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  experimental: {
    // Proxy runs before our route handler and otherwise rejects bodies over 10 MB.
    proxyClientMaxBodySize: BACKUP_RESTORE_MAX_BODY_SIZE,
  },
};

export default nextConfig;
