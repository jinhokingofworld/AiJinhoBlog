import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@/backend/generated/prisma";

import {
  EmbeddingProviderError,
  EmbeddingSkippedError,
  createOpenAIEmbeddingClient,
  type EmbeddingClient,
} from "@/backend/ai-embedding";
import { normalizeKnowledgeText, splitTextIntoChunks } from "@/backend/ai-text";
import {
  ChromaVectorStoreError,
  createChromaVectorStore,
  type VectorMetadata,
  type VectorOperationResult,
  type VectorStore,
} from "@/backend/ai-vector-store";
import {
  DropboxConnectorError,
  createDropboxMarkdownClient,
  type DropboxMarkdownContent,
} from "@/backend/dropbox";
import { prisma as defaultPrisma } from "@/backend/prisma";

export type DropboxVectorPipelineStatus = "INDEXED" | "SKIPPED" | "FAILED" | "DELETED";

export type DropboxVectorPipelineResult = {
  status: DropboxVectorPipelineStatus;
  message: string;
  chunkCount: number;
  chunkIds: string[];
  contentHash?: string;
};

export type DropboxMarkdownSyncResult = {
  deleted: Array<DropboxVectorPipelineResult & { documentId: string; pathDisplay: string }>;
  failed: Array<DropboxVectorPipelineResult & { documentId: string; pathDisplay: string }>;
  indexed: Array<DropboxVectorPipelineResult & { documentId: string; pathDisplay: string }>;
  skipped: Array<DropboxVectorPipelineResult & { documentId: string; pathDisplay: string }>;
  totalRemoteFiles: number;
};

type PipelineDependencies = {
  dropboxClient?: ReturnType<typeof createDropboxMarkdownClient>;
  embeddingClient?: EmbeddingClient;
  prisma?: PrismaClient;
  vectorStore?: VectorStore;
};

type IndexableDropboxMarkdownDocument = {
  id: string;
  ownerId: string;
  name: string;
  pathDisplay: string;
  pathLower: string;
  contentHash: string | null;
  plainText: string;
};

function readChunkIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function createDropboxMarkdownContentHash(file: DropboxMarkdownContent) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        content: file.content,
        name: file.file.name,
        pathLower: file.file.pathLower,
        rev: file.file.rev ?? "",
      }),
    )
    .digest("hex");
}

function createChunkId(documentId: string, contentHash: string, chunkIndex: number) {
  return `dropbox-md:${documentId}:hash:${contentHash.slice(0, 16)}:chunk:${chunkIndex}`;
}

function buildDropboxMarkdownIndexText(document: IndexableDropboxMarkdownDocument) {
  return normalizeKnowledgeText(
    [`문서: ${document.name}`, `경로: ${document.pathDisplay}`, `본문: ${document.plainText}`].join(
      "\n\n",
    ),
  );
}

function toVectorMetadata(
  document: IndexableDropboxMarkdownDocument,
  chunkIndex: number,
  contentHash: string,
): VectorMetadata {
  return {
    sourceId: document.id,
    sourcePath: document.pathDisplay,
    sourceTitle: document.name,
    sourceType: "DROPBOX_MD",
    ownerId: document.ownerId,
    pathLower: document.pathLower,
    chunkIndex,
    contentHash,
  };
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toVectorOperationMetadata(result: VectorOperationResult | void) {
  return {
    durationMs: result?.durationMs,
    retryAttempts: result?.retryAttempts,
  };
}

async function writeAiLog({
  chunkCount,
  document,
  errorMessage,
  inputTokens,
  metadata,
  model,
  prisma,
  provider,
  purpose,
  status,
  totalTokens,
}: {
  chunkCount?: number;
  document: Pick<IndexableDropboxMarkdownDocument, "id" | "ownerId" | "pathDisplay">;
  errorMessage?: string;
  inputTokens?: number | null;
  metadata?: Record<string, unknown>;
  model?: string | null;
  prisma: PrismaClient;
  provider: string;
  purpose: string;
  status: "FAILED" | "SKIPPED" | "SUCCESS";
  totalTokens?: number | null;
}) {
  const logMetadata: Record<string, unknown> = {
    sourcePath: document.pathDisplay,
    sourceType: "DROPBOX_MD",
  };

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (typeof value !== "undefined") {
      logMetadata[key] = value;
    }
  }

  if (typeof chunkCount === "number") {
    logMetadata.chunkCount = chunkCount;
  }

  await prisma.aiRequestLog.create({
    data: {
      purpose,
      provider,
      model,
      status,
      inputTokens,
      totalTokens,
      errorMessage,
      metadata: logMetadata as Prisma.InputJsonValue,
      dropboxMarkdownDocumentId: document.id,
      userId: document.ownerId,
    },
  });
}

async function writeVectorIndex({
  chunkCount,
  chunkIds,
  contentHash,
  document,
  errorMessage,
  lastIndexedAt,
  prisma,
  status,
}: {
  chunkCount: number;
  chunkIds: string[];
  contentHash?: string;
  document: IndexableDropboxMarkdownDocument;
  errorMessage?: string;
  lastIndexedAt?: Date | null;
  prisma: PrismaClient;
  status: DropboxVectorPipelineStatus;
}) {
  await prisma.dropboxMarkdownVectorIndex.upsert({
    where: {
      documentId: document.id,
    },
    create: {
      documentId: document.id,
      ownerId: document.ownerId,
      status,
      contentHash,
      chunkCount,
      chunkIds: chunkIds as Prisma.InputJsonValue,
      errorMessage,
      lastIndexedAt,
    },
    update: {
      ownerId: document.ownerId,
      status,
      contentHash,
      chunkCount,
      chunkIds: chunkIds as Prisma.InputJsonValue,
      errorMessage,
      lastIndexedAt,
    },
  });
}

async function deleteExistingChunks({
  chunkIds,
  document,
  prisma,
  vectorStore,
}: {
  chunkIds: string[];
  document: Pick<IndexableDropboxMarkdownDocument, "id" | "ownerId" | "pathDisplay">;
  prisma: PrismaClient;
  vectorStore: VectorStore;
}) {
  if (!chunkIds.length) {
    return;
  }

  const result = await vectorStore.delete(chunkIds);
  await writeAiLog({
    chunkCount: chunkIds.length,
    metadata: {
      chunkIds,
      ...toVectorOperationMetadata(result),
    },
    document,
    prisma,
    provider: "chromadb",
    purpose: "DROPBOX_MD_VECTOR_DELETE",
    status: "SUCCESS",
  });

  return result;
}

function buildFailureResult(
  error: unknown,
): Pick<DropboxVectorPipelineResult, "message" | "status"> {
  return {
    status: "FAILED",
    message:
      error instanceof Error ? error.message : "Dropbox Markdown 인덱싱 처리에 실패했습니다.",
  };
}

function getFailureLogContext(error: unknown) {
  if (error instanceof EmbeddingProviderError) {
    return {
      metadata: {
        durationMs: error.durationMs,
        retryAttempts: error.retryAttempts,
        status: error.status,
      },
      model: process.env.OPENAI_EMBEDDING_MODEL ?? null,
      provider: "openai",
      purpose: "DROPBOX_MD_EMBEDDING",
    };
  }

  if (error instanceof ChromaVectorStoreError) {
    return {
      metadata: {
        durationMs: error.durationMs,
        operation: error.operation,
        retryAttempts: error.retryAttempts,
        status: error.status,
      },
      model: process.env.CHROMA_COLLECTION ?? "blog_posts",
      provider: "chromadb",
      purpose:
        error.operation === "delete"
          ? "DROPBOX_MD_VECTOR_DELETE"
          : error.operation === "collection"
            ? "DROPBOX_MD_VECTOR_COLLECTION"
            : "DROPBOX_MD_VECTOR_UPSERT",
    };
  }

  return {
    metadata: {},
    model: null,
    provider: "pipeline",
    purpose: "DROPBOX_MD_VECTOR_SYNC",
  };
}

function mergeUniqueChunkIds(...groups: string[][]) {
  return [...new Set(groups.flat())];
}

export async function upsertDropboxMarkdownDocument({
  file,
  ownerId,
  prisma = defaultPrisma,
}: {
  file: DropboxMarkdownContent;
  ownerId: string;
  prisma?: PrismaClient;
}) {
  const contentHash = createDropboxMarkdownContentHash(file);
  const plainText = normalizeKnowledgeText(file.content);

  return prisma.dropboxMarkdownDocument.upsert({
    where: {
      ownerId_pathLower: {
        ownerId,
        pathLower: file.file.pathLower,
      },
    },
    create: {
      ownerId,
      dropboxFileId: file.file.id,
      name: file.file.name,
      pathDisplay: file.file.pathDisplay,
      pathLower: file.file.pathLower,
      rev: file.file.rev,
      serverModified: parseDate(file.file.serverModified),
      size: file.file.size,
      contentHash,
      markdown: file.content,
      plainText,
      lastSyncedAt: new Date(),
    },
    update: {
      dropboxFileId: file.file.id,
      name: file.file.name,
      pathDisplay: file.file.pathDisplay,
      rev: file.file.rev,
      serverModified: parseDate(file.file.serverModified),
      size: file.file.size,
      contentHash,
      markdown: file.content,
      plainText,
      lastSyncedAt: new Date(),
    },
  });
}

export async function syncDropboxMarkdownVectorIndex(
  document: IndexableDropboxMarkdownDocument,
  dependencies: PipelineDependencies = {},
): Promise<DropboxVectorPipelineResult> {
  const prisma = dependencies.prisma ?? defaultPrisma;
  const embeddingClient = dependencies.embeddingClient ?? createOpenAIEmbeddingClient();
  const vectorStore = dependencies.vectorStore ?? createChromaVectorStore();
  const contentHash =
    document.contentHash ??
    createHash("sha256")
      .update(
        JSON.stringify({
          name: document.name,
          pathLower: document.pathLower,
          plainText: document.plainText,
        }),
      )
      .digest("hex");
  const chunks = splitTextIntoChunks(buildDropboxMarkdownIndexText(document));
  const chunkIds = chunks.map((_, index) => createChunkId(document.id, contentHash, index));
  const existing = await prisma.dropboxMarkdownVectorIndex.findUnique({
    where: {
      documentId: document.id,
    },
    select: {
      chunkIds: true,
      contentHash: true,
    },
  });
  const previousChunkIds = readChunkIds(existing?.chunkIds);
  const previousContentHash = existing?.contentHash ?? undefined;
  let failureChunkIds = previousChunkIds;
  let failureContentHash = previousContentHash;
  let failureChunkCount = previousChunkIds.length;

  try {
    if (!chunks.length) {
      const message = "인덱싱할 Dropbox Markdown 텍스트가 없어 벡터 저장을 건너뜁니다.";

      await deleteExistingChunks({
        chunkIds: previousChunkIds,
        document,
        prisma,
        vectorStore,
      });
      await writeVectorIndex({
        chunkCount: 0,
        chunkIds: [],
        contentHash,
        document,
        errorMessage: message,
        lastIndexedAt: null,
        prisma,
        status: "SKIPPED",
      });
      await writeAiLog({
        chunkCount: 0,
        document,
        errorMessage: message,
        model: null,
        prisma,
        provider: "openai",
        purpose: "DROPBOX_MD_EMBEDDING",
        status: "SKIPPED",
      });

      return {
        status: "SKIPPED",
        message,
        chunkCount: 0,
        chunkIds: [],
        contentHash,
      };
    }

    const embeddingResult = await embeddingClient.embedDocuments(chunks);

    await writeAiLog({
      chunkCount: chunks.length,
      document,
      inputTokens: embeddingResult.usage.inputTokens,
      metadata: {
        durationMs: embeddingResult.durationMs,
        retryAttempts: embeddingResult.retryAttempts,
      },
      model: embeddingResult.model,
      prisma,
      provider: "openai",
      purpose: "DROPBOX_MD_EMBEDDING",
      status: "SUCCESS",
      totalTokens: embeddingResult.usage.totalTokens,
    });

    const upsertResult = await vectorStore.upsert(
      chunks.map((chunk, index) => ({
        id: chunkIds[index],
        embedding: embeddingResult.embeddings[index],
        document: chunk,
        metadata: toVectorMetadata(document, index, contentHash),
      })),
    );
    failureChunkIds = mergeUniqueChunkIds(chunkIds, previousChunkIds);
    failureContentHash = contentHash;
    failureChunkCount = failureChunkIds.length;
    await writeAiLog({
      chunkCount: chunks.length,
      document,
      metadata: {
        chunkIds,
        ...toVectorOperationMetadata(upsertResult),
      },
      model: process.env.CHROMA_COLLECTION ?? "blog_posts",
      prisma,
      provider: "chromadb",
      purpose: "DROPBOX_MD_VECTOR_UPSERT",
      status: "SUCCESS",
    });

    const obsoleteChunkIds = previousChunkIds.filter((id) => !chunkIds.includes(id));

    await deleteExistingChunks({
      chunkIds: obsoleteChunkIds,
      document,
      prisma,
      vectorStore,
    });
    await writeVectorIndex({
      chunkCount: chunks.length,
      chunkIds,
      contentHash,
      document,
      lastIndexedAt: new Date(),
      prisma,
      status: "INDEXED",
    });

    return {
      status: "INDEXED",
      message: "Dropbox Markdown 벡터 인덱싱이 완료되었습니다.",
      chunkCount: chunks.length,
      chunkIds,
      contentHash,
    };
  } catch (error) {
    if (error instanceof EmbeddingSkippedError) {
      const skippedContentHash = previousChunkIds.length ? previousContentHash : contentHash;

      await writeVectorIndex({
        chunkCount: previousChunkIds.length,
        chunkIds: previousChunkIds,
        contentHash: skippedContentHash,
        document,
        errorMessage: error.message,
        lastIndexedAt: null,
        prisma,
        status: "SKIPPED",
      });
      await writeAiLog({
        chunkCount: chunks.length,
        document,
        errorMessage: error.message,
        model: process.env.OPENAI_EMBEDDING_MODEL ?? null,
        prisma,
        provider: "openai",
        purpose: "DROPBOX_MD_EMBEDDING",
        status: "SKIPPED",
      });

      return {
        status: "SKIPPED",
        message: error.message,
        chunkCount: previousChunkIds.length,
        chunkIds: previousChunkIds,
        contentHash: skippedContentHash,
      };
    }

    const failure = buildFailureResult(error);
    const failureContext = getFailureLogContext(error);

    await writeVectorIndex({
      chunkCount: failureChunkCount,
      chunkIds: failureChunkIds,
      contentHash: failureContentHash,
      document,
      errorMessage: failure.message,
      lastIndexedAt: null,
      prisma,
      status: "FAILED",
    });
    await writeAiLog({
      chunkCount: chunks.length,
      document,
      errorMessage: failure.message,
      metadata: {
        ...failureContext.metadata,
        attemptedChunkIds: chunkIds,
        attemptedContentHash: contentHash,
        preservedChunkIds: failureChunkIds,
      },
      model: failureContext.model,
      prisma,
      provider: failureContext.provider,
      purpose: failureContext.purpose,
      status: "FAILED",
    });

    return {
      ...failure,
      chunkCount: failureChunkCount,
      chunkIds: failureChunkIds,
      contentHash: failureContentHash,
    };
  }
}

export async function deleteDropboxMarkdownVectorIndex(
  document: Pick<IndexableDropboxMarkdownDocument, "id" | "ownerId" | "pathDisplay">,
  dependencies: Pick<PipelineDependencies, "prisma" | "vectorStore"> = {},
): Promise<DropboxVectorPipelineResult> {
  const prisma = dependencies.prisma ?? defaultPrisma;
  const vectorStore = dependencies.vectorStore ?? createChromaVectorStore();
  const existing = await prisma.dropboxMarkdownVectorIndex.findUnique({
    where: {
      documentId: document.id,
    },
    select: {
      chunkIds: true,
      contentHash: true,
    },
  });
  const chunkIds = readChunkIds(existing?.chunkIds);

  try {
    await deleteExistingChunks({
      chunkIds,
      document,
      prisma,
      vectorStore,
    });
    await prisma.dropboxMarkdownVectorIndex.updateMany({
      where: {
        documentId: document.id,
      },
      data: {
        status: "DELETED",
        chunkCount: 0,
        chunkIds: [],
        errorMessage: null,
        lastIndexedAt: null,
      },
    });

    return {
      status: "DELETED",
      message: "Dropbox Markdown 벡터가 삭제되었습니다.",
      chunkCount: 0,
      chunkIds: [],
      contentHash: existing?.contentHash ?? undefined,
    };
  } catch (error) {
    const failure = buildFailureResult(error);
    const failureContext = getFailureLogContext(error);

    await writeAiLog({
      chunkCount: chunkIds.length,
      document,
      errorMessage: failure.message,
      metadata: {
        chunkIds,
        ...failureContext.metadata,
      },
      model: failureContext.model,
      prisma,
      provider: failureContext.provider,
      purpose: failureContext.purpose,
      status: "FAILED",
    });

    return {
      ...failure,
      chunkCount: chunkIds.length,
      chunkIds,
      contentHash: existing?.contentHash ?? undefined,
    };
  }
}

export async function syncDropboxMarkdownDocuments(
  ownerId: string,
  {
    path,
    recursive = true,
  }: {
    path?: string | null;
    recursive?: boolean;
  } = {},
  dependencies: PipelineDependencies = {},
): Promise<DropboxMarkdownSyncResult> {
  const prisma = dependencies.prisma ?? defaultPrisma;
  const dropboxClient = dependencies.dropboxClient ?? createDropboxMarkdownClient();
  const result: DropboxMarkdownSyncResult = {
    deleted: [],
    failed: [],
    indexed: [],
    skipped: [],
    totalRemoteFiles: 0,
  };
  const files = await dropboxClient.listMarkdownFiles({
    path,
    recursive,
  });
  const seenPathLower = new Set(files.map((file) => file.pathLower));

  result.totalRemoteFiles = files.length;

  for (const file of files) {
    const content = await dropboxClient.readMarkdownFile(file.pathLower);
    const document = await upsertDropboxMarkdownDocument({
      file: content,
      ownerId,
      prisma,
    });
    const indexed = await syncDropboxMarkdownVectorIndex(document, dependencies);
    const item = {
      ...indexed,
      documentId: document.id,
      pathDisplay: document.pathDisplay,
    };

    if (indexed.status === "INDEXED") {
      result.indexed.push(item);
    } else if (indexed.status === "SKIPPED") {
      result.skipped.push(item);
    } else {
      result.failed.push(item);
    }
  }

  const staleDocuments = await prisma.dropboxMarkdownDocument.findMany({
    where: {
      ownerId,
      ...(seenPathLower.size
        ? {
            pathLower: {
              notIn: [...seenPathLower],
            },
          }
        : {}),
    },
    select: {
      id: true,
      ownerId: true,
      pathDisplay: true,
    },
  });

  for (const staleDocument of staleDocuments) {
    const deleted = await deleteDropboxMarkdownVectorIndex(staleDocument, dependencies);
    const item = {
      ...deleted,
      documentId: staleDocument.id,
      pathDisplay: staleDocument.pathDisplay,
    };

    if (deleted.status === "DELETED") {
      await prisma.dropboxMarkdownDocument.delete({
        where: {
          id: staleDocument.id,
        },
      });
      result.deleted.push(item);
    } else {
      result.failed.push(item);
    }
  }

  return result;
}

export function isDropboxSyncSourceError(error: unknown) {
  return error instanceof DropboxConnectorError;
}
