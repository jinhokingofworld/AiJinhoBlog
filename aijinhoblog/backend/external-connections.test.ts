import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExternalConnectionRequiredError,
  decryptExternalToken,
  encryptExternalToken,
  getExternalConnectionAccessToken,
  serializeExternalConnection,
} from "@/backend/external-connections";

const originalEncryptionKey = process.env.EXTERNAL_CONNECTION_ENCRYPTION_KEY;

afterEach(() => {
  process.env.EXTERNAL_CONNECTION_ENCRYPTION_KEY = originalEncryptionKey;
  vi.restoreAllMocks();
});

describe("external connection token storage", () => {
  it("encrypts and decrypts external tokens", () => {
    process.env.EXTERNAL_CONNECTION_ENCRYPTION_KEY = "test-secret";

    const encrypted = encryptExternalToken("dropbox-token");

    expect(encrypted).not.toContain("dropbox-token");
    expect(decryptExternalToken(encrypted)).toBe("dropbox-token");
  });

  it("serializes connection metadata without token ciphertext", () => {
    const connection = {
      id: "connection-1",
      ownerId: "user-1",
      provider: "DROPBOX",
      providerAccountId: "account-1",
      providerAccountName: "Dropbox account-1",
      scope: "files.metadata.read files.content.read",
      accessTokenCiphertext: "encrypted-access",
      refreshTokenCiphertext: "encrypted-refresh",
      expiresAt: null,
      status: "CONNECTED",
      lastSyncedAt: null,
      lastError: null,
      createdAt: new Date("2026-06-14T00:00:00Z"),
      updatedAt: new Date("2026-06-14T00:00:01Z"),
    } as const;

    const serialized = serializeExternalConnection(connection);

    expect(serialized).toEqual({
      id: "connection-1",
      provider: "DROPBOX",
      providerAccountId: "account-1",
      providerAccountName: "Dropbox account-1",
      scope: "files.metadata.read files.content.read",
      status: "CONNECTED",
      expiresAt: null,
      lastSyncedAt: null,
      lastError: null,
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:01.000Z",
    });
    expect(JSON.stringify(serialized)).not.toContain("encrypted-access");
  });

  it("requires an active user-owned connection before reading a token", async () => {
    const prisma = {
      externalKnowledgeConnection: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(
      getExternalConnectionAccessToken("user-1", "DROPBOX", prisma as never),
    ).rejects.toBeInstanceOf(ExternalConnectionRequiredError);
  });
});
