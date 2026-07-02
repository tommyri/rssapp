import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (docs/tech-stack.md).
  output: "standalone",
};

export default nextConfig;
