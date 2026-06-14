import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type {
  ExternalKnowledgeConnection,
  ExternalKnowledgeProvider,
  PrismaClient,
} from "@/backend/generated/prisma";

import { refreshDropboxOAuthToken } from "@/backend/dropbox-oauth";
import { prisma as defaultPrisma } from "@/backend/prisma";

const TOKEN_CIPHER_VERSION = "v1";
const TOKEN_REFRESH_BUFFER_MS = 1000 * 60;

type ExternalConnectionPrisma = Pick<PrismaClient, "externalKnowledgeConnection">;

export class ExternalConnectionRequiredError extends Error {
  provider: ExternalKnowledgeProvider;

  constructor(provider: ExternalKnowledgeProvider) {
    super(`${provider} 연결이 필요합니다.`);
    this.name = "ExternalConnectionRequiredError";
    this.provider = provider;
  }
}

export class ExternalConnectionTokenError extends Error {
  constructor(message = "외부 연결 토큰을 읽지 못했습니다.") {
    super(message);
    this.name = "ExternalConnectionTokenError";
  }
}

export type SerializedExternalConnection = {
  id: string;
  provider: ExternalKnowledgeProvider;
  providerAccountId: string | null;
  providerAccountName: string | null;
  scope: string | null;
  status: ExternalKnowledgeConnection["status"];
  expiresAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DropboxOAuthTokenPayload = {
  accessToken: string;
  accountId?: string | null;
  expiresIn?: number | null;
  refreshToken?: string | null;
  scope?: string | null;
};

function getEncryptionSecret() {
  const secret =
    process.env.EXTERNAL_CONNECTION_ENCRYPTION_KEY ??
    process.env.AUTH_JWT_SECRET ??
    process.env.NEXTAUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new ExternalConnectionTokenError("EXTERNAL_CONNECTION_ENCRYPTION_KEY 설정이 필요합니다.");
  }

  return "aijinhoblog-development-external-token-secret";
}

function getEncryptionKey() {
  return createHash("sha256").update(getEncryptionSecret()).digest();
}

function parseCiphertext(ciphertext: string) {
  const [version, iv, tag, encrypted] = ciphertext.split(":");

  if (version !== TOKEN_CIPHER_VERSION || !iv || !tag || !encrypted) {
    throw new ExternalConnectionTokenError();
  }

  return {
    encrypted: Buffer.from(encrypted, "base64url"),
    iv: Buffer.from(iv, "base64url"),
    tag: Buffer.from(tag, "base64url"),
  };
}

export function encryptExternalToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_CIPHER_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptExternalToken(ciphertext: string) {
  const parsed = parseCiphertext(ciphertext);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), parsed.iv);

  decipher.setAuthTag(parsed.tag);

  return Buffer.concat([decipher.update(parsed.encrypted), decipher.final()]).toString("utf8");
}

export function serializeExternalConnection(
  connection: ExternalKnowledgeConnection,
): SerializedExternalConnection {
  return {
    id: connection.id,
    provider: connection.provider,
    providerAccountId: connection.providerAccountId,
    providerAccountName: connection.providerAccountName,
    scope: connection.scope,
    status: connection.status,
    expiresAt: connection.expiresAt?.toISOString() ?? null,
    lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    lastError: connection.lastError,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export async function listExternalConnections(
  ownerId: string,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  const connections = await prisma.externalKnowledgeConnection.findMany({
    where: {
      ownerId,
    },
    orderBy: {
      provider: "asc",
    },
  });

  return connections.map(serializeExternalConnection);
}

export function getExternalConnection(
  ownerId: string,
  provider: ExternalKnowledgeProvider,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  return prisma.externalKnowledgeConnection.findUnique({
    where: {
      ownerId_provider: {
        ownerId,
        provider,
      },
    },
  });
}

export async function getRequiredExternalConnection(
  ownerId: string,
  provider: ExternalKnowledgeProvider,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  const connection = await getExternalConnection(ownerId, provider, prisma);

  if (!connection || connection.status !== "CONNECTED") {
    throw new ExternalConnectionRequiredError(provider);
  }

  return connection;
}

export async function getExternalConnectionAccessToken(
  ownerId: string,
  provider: ExternalKnowledgeProvider,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  const connection = await getRequiredExternalConnection(ownerId, provider, prisma);

  return decryptExternalToken(connection.accessTokenCiphertext);
}

function shouldRefreshConnection(connection: ExternalKnowledgeConnection) {
  return (
    connection.provider === "DROPBOX" &&
    connection.expiresAt !== null &&
    connection.expiresAt.getTime() <= Date.now() + TOKEN_REFRESH_BUFFER_MS
  );
}

export async function getDropboxConnectionAccessToken(
  ownerId: string,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  const connection = await getRequiredExternalConnection(ownerId, "DROPBOX", prisma);

  if (!shouldRefreshConnection(connection)) {
    return decryptExternalToken(connection.accessTokenCiphertext);
  }

  if (!connection.refreshTokenCiphertext) {
    await markExternalConnectionError(
      ownerId,
      "DROPBOX",
      new ExternalConnectionTokenError("Dropbox refresh token이 없습니다."),
      prisma,
    );
    throw new ExternalConnectionRequiredError("DROPBOX");
  }

  try {
    const refreshed = await refreshDropboxOAuthToken(
      decryptExternalToken(connection.refreshTokenCiphertext),
    );
    const expiresAt =
      refreshed.expiresIn && refreshed.expiresIn > 0
        ? new Date(Date.now() + refreshed.expiresIn * 1000)
        : null;

    await prisma.externalKnowledgeConnection.update({
      where: {
        ownerId_provider: {
          ownerId,
          provider: "DROPBOX",
        },
      },
      data: {
        accessTokenCiphertext: encryptExternalToken(refreshed.accessToken),
        expiresAt,
        scope: refreshed.scope ?? connection.scope,
        status: "CONNECTED",
        lastError: null,
      },
    });

    return refreshed.accessToken;
  } catch (error) {
    await markExternalConnectionError(ownerId, "DROPBOX", error, prisma);
    throw error;
  }
}

export async function upsertDropboxConnectionFromOAuth(
  ownerId: string,
  payload: DropboxOAuthTokenPayload,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  const expiresAt =
    payload.expiresIn && payload.expiresIn > 0
      ? new Date(Date.now() + payload.expiresIn * 1000)
      : null;
  const refreshTokenCiphertext = payload.refreshToken
    ? encryptExternalToken(payload.refreshToken)
    : undefined;

  return prisma.externalKnowledgeConnection.upsert({
    where: {
      ownerId_provider: {
        ownerId,
        provider: "DROPBOX",
      },
    },
    create: {
      ownerId,
      provider: "DROPBOX",
      providerAccountId: payload.accountId ?? null,
      providerAccountName: payload.accountId ? `Dropbox ${payload.accountId}` : null,
      scope: payload.scope ?? null,
      accessTokenCiphertext: encryptExternalToken(payload.accessToken),
      refreshTokenCiphertext: refreshTokenCiphertext ?? null,
      expiresAt,
      status: "CONNECTED",
      lastError: null,
    },
    update: {
      providerAccountId: payload.accountId ?? null,
      providerAccountName: payload.accountId ? `Dropbox ${payload.accountId}` : null,
      scope: payload.scope ?? null,
      accessTokenCiphertext: encryptExternalToken(payload.accessToken),
      ...(refreshTokenCiphertext ? { refreshTokenCiphertext } : {}),
      expiresAt,
      status: "CONNECTED",
      lastError: null,
    },
  });
}

export async function markExternalConnectionSynced(
  ownerId: string,
  provider: ExternalKnowledgeProvider,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  return prisma.externalKnowledgeConnection.update({
    where: {
      ownerId_provider: {
        ownerId,
        provider,
      },
    },
    data: {
      lastError: null,
      lastSyncedAt: new Date(),
      status: "CONNECTED",
    },
  });
}

export async function markExternalConnectionError(
  ownerId: string,
  provider: ExternalKnowledgeProvider,
  error: unknown,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  return prisma.externalKnowledgeConnection
    .update({
      where: {
        ownerId_provider: {
          ownerId,
          provider,
        },
      },
      data: {
        lastError: error instanceof Error ? error.message : "외부 연결 작업이 실패했습니다.",
        status: "ERROR",
      },
    })
    .catch(() => null);
}

export async function deleteExternalConnection(
  ownerId: string,
  provider: ExternalKnowledgeProvider,
  prisma: ExternalConnectionPrisma = defaultPrisma,
) {
  await prisma.externalKnowledgeConnection
    .delete({
      where: {
        ownerId_provider: {
          ownerId,
          provider,
        },
      },
    })
    .catch(() => null);
}
