import type { NextConfig } from "next";
import { BACKUP_RESTORE_MAX_BODY_SIZE } from "./src/lib/backup-restore-config";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (docs/tech-stack.md).
  output: "standalone",
  experimental: {
    // Proxy runs before our route handler and otherwise rejects bodies over 10 MB.
    proxyClientMaxBodySize: BACKUP_RESTORE_MAX_BODY_SIZE,
  },
};

export default nextConfig;
