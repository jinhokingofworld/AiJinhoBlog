import { afterEach, describe, expect, it, vi } from "vitest";

import { createMcpOwnerWhere, resolveMcpOwner } from "@/backend/mcp/tools";

describe("mcp tools owner resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not resolve an implicit first user when no owner identifier is configured", async () => {
    vi.stubEnv("AIJINHOBLOG_MCP_OWNER_ID", "");
    vi.stubEnv("AIJINHOBLOG_MCP_OWNER_USERNAME", "");
    vi.stubEnv("AIJINHOBLOG_MCP_OWNER_EMAIL", "");

    expect(createMcpOwnerWhere()).toBeNull();
    await expect(resolveMcpOwner()).rejects.toMatchObject({
      status: 400,
    });
  });

  it("builds an explicit owner filter from tool input and environment fallback", () => {
    vi.stubEnv("AIJINHOBLOG_MCP_OWNER_ID", "env-owner");
    vi.stubEnv("AIJINHOBLOG_MCP_OWNER_USERNAME", "env-user");
    vi.stubEnv("AIJINHOBLOG_MCP_OWNER_EMAIL", "env@example.com");

    expect(createMcpOwnerWhere()).toEqual({
      email: "env@example.com",
      id: "env-owner",
      username: "env-user",
    });
    expect(createMcpOwnerWhere({ ownerUsername: "input-user" })).toEqual({
      email: "env@example.com",
      id: "env-owner",
      username: "input-user",
    });
  });
});
