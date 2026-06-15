import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const appDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appDir, "..");

loadEnvConfig(workspaceRoot);

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: appDir,
  },
};

export default nextConfig;
