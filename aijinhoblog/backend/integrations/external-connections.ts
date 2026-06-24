import type {
  ExternalKnowledgeConnection,
  ExternalKnowledgeProvider,
  PrismaClient,
} from "@/backend/generated/prisma";

import { refreshDropboxOAuthToken } from "@/backend/integrations/dropbox/oauth";
import "@/backend/core/env";
import {
  decryptExternalToken,
  encryptExternalToken,
  ExternalConnectionTokenError,
} from "@/backend/integrations/external-token-crypto";
import { prisma as defaultPrisma } from "@/backend/core/prisma";

const TOKEN_REFRESH_BUFFER_MS = 1000 * 60;

// 외부지식 연결 관리 계층입니다.
// 현재 Dropbox를 구현했고, ExternalKnowledgeConnection 모델을 provider별 사용자 연결 registry로 사용합니다.
// 실전 구현 포인트: provider token은 원문 저장하지 않고 AES-GCM ciphertext로 저장합니다.
export {
  decryptExternalToken,
  encryptExternalToken,
} from "@/backend/integrations/external-token-crypto";

type ExternalConnectionPrisma = Pick<PrismaClient, "externalKnowledgeConnection">;

export class ExternalConnectionRequiredError extends Error {
  provider: ExternalKnowledgeProvider;

  constructor(provider: ExternalKnowledgeProvider) {
    super(`${provider} 연결이 필요합니다.`);
    this.name = "ExternalConnectionRequiredError";
    this.provider = provider;
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

  // Dropbox access token이 만료 직전이면 refresh token으로 새 access token을 받고 DB ciphertext를 즉시 갱신합니다.
  // RAG/동기화 route는 이 함수를 통해 항상 사용자별 최신 token을 얻습니다.
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
  // OAuth callback에서 받은 token을 ExternalKnowledgeConnection에 저장하는 지점입니다.
  // ownerId_provider unique key 덕분에 사용자가 Dropbox를 다시 연결하면 기존 연결을 갱신합니다.
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

export async function markExternalConnectionOperationError(
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
        status: "CONNECTED",
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
