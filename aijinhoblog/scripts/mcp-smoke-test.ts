import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expectedTools = [
  "blog_create_draft_from_image",
  "blog_create_draft_from_link",
  "blog_create_post",
  "blog_delete_post",
  "blog_get_post",
  "blog_list_posts",
  "blog_update_post",
];

async function main() {
  const client = new Client({
    name: "aijinhoblog-smoke-test",
    version: "0.1.0",
  });
  const transport = new StdioClientTransport({
    args: ["scripts/mcp-server.ts"],
    command: "./node_modules/.bin/tsx",
    cwd: process.cwd(),
    env: {
      ...process.env,
      AIJINHOBLOG_MCP_OWNER_USERNAME: process.env.AIJINHOBLOG_MCP_OWNER_USERNAME ?? "smoke",
    },
    stderr: "pipe",
  });

  await client.connect(transport);

  const tools = await client.listTools();
  const names = new Set(tools.tools.map((tool) => tool.name));
  const missing = expectedTools.filter((name) => !names.has(name));

  await client.close();

  if (missing.length) {
    throw new Error(`MCP tools missing: ${missing.join(", ")}`);
  }

  console.log(`MCP tools registered: ${expectedTools.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
