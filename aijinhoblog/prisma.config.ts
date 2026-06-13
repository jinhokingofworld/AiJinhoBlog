import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

const appDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appDir, "..");

loadEnvConfig(workspaceRoot);

const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://aijinho:aijinho_password@localhost:3306/aijinhoblog";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
