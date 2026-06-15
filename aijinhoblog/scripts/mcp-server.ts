import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerBlogMcpTools } from "@/backend/mcp/tools";
import { prisma } from "@/backend/core/prisma";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "../..");

loadEnvConfig(workspaceRoot);

async function main() {
  const server = new McpServer({
    name: "aijinhoblog",
    version: "0.1.0",
  });

  registerBlogMcpTools(server);

  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.exitCode) {
      await prisma.$disconnect();
    }
  });
