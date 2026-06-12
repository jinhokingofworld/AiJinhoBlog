import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

import {
  EmbeddingSkippedError,
  createOpenAIEmbeddingClient,
  type EmbeddingClient,
} from "@/lib/ai-embedding";
import {
  buildPostIndexText,
  createPostContentHash,
  splitTextIntoChunks,
  type IndexablePostText,
} from "@/lib/ai-text";
import {
  createChromaVectorStore,
  type VectorMetadata,
  type VectorStore,
} from "@/lib/ai-vector-store";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type IndexablePost = IndexablePostText & {
  id: string;
  authorId: string;
  folderId: string | null;
};

export type VectorPipelineStatus = "INDEXED" | "SKIPPED" | "FAILED" | "DELETED";

export type VectorPipelineResult = {
  status: VectorPipelineStatus;
  message: string;
  chunkCount: number;
  chunkIds: string[];
  contentHash?: string;
};

type PipelineDependencies = {
  prisma?: PrismaClient;
  embeddingClient?: EmbeddingClient;
  vectorStore?: VectorStore;
};

function readChunkIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function createChunkId(postId: string, chunkIndex: number) {
  return `post:${postId}:chunk:${chunkIndex}`;
}

function toVectorMetadata(
  post: IndexablePost,
  chunkIndex: number,
  contentHash: string,
): VectorMetadata {
  return {
    postId: post.id,
    authorId: post.authorId,
    status: post.status ?? "",
    visibility: post.visibility ?? "",
    folderId: post.folderId ?? "",
    chunkIndex,
    contentHash,
  };
}

async function writeAiLog({
  chunkCount,
  errorMessage,
  inputTokens,
  metadata,
  model,
  post,
  prisma,
  provider,
  purpose,
  status,
  totalTokens,
}: {
  chunkCount?: number;
  errorMessage?: string;
  inputTokens?: number | null;
  metadata?: Record<string, unknown>;
  model?: string | null;
  post: Pick<IndexablePost, "id" | "authorId">;
  prisma: PrismaClient;
  provider: string;
  purpose: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  totalTokens?: number | null;
}) {
  const logMetadata: Record<string, unknown> = {
    ...(metadata ?? {}),
  };

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
      postId: post.id,
      userId: post.authorId,
    },
  });
}

async function writeVectorIndex({
  chunkCount,
  chunkIds,
  contentHash,
  errorMessage,
  lastIndexedAt,
  post,
  prisma,
  status,
}: {
  chunkCount: number;
  chunkIds: string[];
  contentHash?: string;
  errorMessage?: string;
  lastIndexedAt?: Date | null;
  post: IndexablePost;
  prisma: PrismaClient;
  status: VectorPipelineStatus;
}) {
  await prisma.postVectorIndex.upsert({
    where: {
      postId: post.id,
    },
    create: {
      postId: post.id,
      authorId: post.authorId,
      status,
      contentHash,
      chunkCount,
      chunkIds: chunkIds as Prisma.InputJsonValue,
      errorMessage,
      lastIndexedAt,
    },
    update: {
      authorId: post.authorId,
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
  post,
  prisma,
  vectorStore,
}: {
  chunkIds: string[];
  post: Pick<IndexablePost, "id" | "authorId">;
  prisma: PrismaClient;
  vectorStore: VectorStore;
}) {
  if (!chunkIds.length) {
    return;
  }

  await vectorStore.delete(chunkIds);
  await writeAiLog({
    chunkCount: chunkIds.length,
    metadata: {
      chunkIds,
    },
    post,
    prisma,
    provider: "chromadb",
    purpose: "POST_VECTOR_DELETE",
    status: "SUCCESS",
  });
}

function buildFailureResult(error: unknown): Pick<VectorPipelineResult, "message" | "status"> {
  return {
    status: "FAILED",
    message: error instanceof Error ? error.message : "AI 데이터 파이프라인 처리에 실패했습니다.",
  };
}

export async function syncPostVectorIndex(
  post: IndexablePost,
  dependencies: PipelineDependencies = {},
): Promise<VectorPipelineResult> {
  const prisma = dependencies.prisma ?? defaultPrisma;
  const embeddingClient = dependencies.embeddingClient ?? createOpenAIEmbeddingClient();
  const vectorStore = dependencies.vectorStore ?? createChromaVectorStore();
  const indexText = buildPostIndexText(post);
  const chunks = splitTextIntoChunks(indexText);
  const contentHash = createPostContentHash(post);
  const chunkIds = chunks.map((_, index) => createChunkId(post.id, index));
  const existing = await prisma.postVectorIndex.findUnique({
    where: {
      postId: post.id,
    },
    select: {
      chunkIds: true,
    },
  });
  const previousChunkIds = readChunkIds(existing?.chunkIds);

  try {
    await deleteExistingChunks({
      chunkIds: previousChunkIds,
      post,
      prisma,
      vectorStore,
    });

    if (!chunks.length) {
      const message = "인덱싱할 게시글 텍스트가 없어 벡터 저장을 건너뜁니다.";

      await writeVectorIndex({
        chunkCount: 0,
        chunkIds: [],
        contentHash,
        errorMessage: message,
        lastIndexedAt: null,
        post,
        prisma,
        status: "SKIPPED",
      });
      await writeAiLog({
        chunkCount: 0,
        errorMessage: message,
        model: null,
        post,
        prisma,
        provider: "openai",
        purpose: "POST_EMBEDDING",
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
      inputTokens: embeddingResult.usage.inputTokens,
      model: embeddingResult.model,
      post,
      prisma,
      provider: "openai",
      purpose: "POST_EMBEDDING",
      status: "SUCCESS",
      totalTokens: embeddingResult.usage.totalTokens,
    });

    await vectorStore.upsert(
      chunks.map((chunk, index) => ({
        id: chunkIds[index],
        embedding: embeddingResult.embeddings[index],
        document: chunk,
        metadata: toVectorMetadata(post, index, contentHash),
      })),
    );
    await writeAiLog({
      chunkCount: chunks.length,
      metadata: {
        chunkIds,
      },
      model: process.env.CHROMA_COLLECTION ?? "blog_posts",
      post,
      prisma,
      provider: "chromadb",
      purpose: "POST_VECTOR_UPSERT",
      status: "SUCCESS",
    });
    await writeVectorIndex({
      chunkCount: chunks.length,
      chunkIds,
      contentHash,
      lastIndexedAt: new Date(),
      post,
      prisma,
      status: "INDEXED",
    });

    return {
      status: "INDEXED",
      message: "게시글 벡터 인덱싱이 완료되었습니다.",
      chunkCount: chunks.length,
      chunkIds,
      contentHash,
    };
  } catch (error) {
    if (error instanceof EmbeddingSkippedError) {
      await writeVectorIndex({
        chunkCount: chunks.length,
        chunkIds: [],
        contentHash,
        errorMessage: error.message,
        lastIndexedAt: null,
        post,
        prisma,
        status: "SKIPPED",
      });
      await writeAiLog({
        chunkCount: chunks.length,
        errorMessage: error.message,
        model: process.env.OPENAI_EMBEDDING_MODEL ?? null,
        post,
        prisma,
        provider: "openai",
        purpose: "POST_EMBEDDING",
        status: "SKIPPED",
      });

      return {
        status: "SKIPPED",
        message: error.message,
        chunkCount: chunks.length,
        chunkIds: [],
        contentHash,
      };
    }

    const failure = buildFailureResult(error);

    await writeVectorIndex({
      chunkCount: chunks.length,
      chunkIds: [],
      contentHash,
      errorMessage: failure.message,
      lastIndexedAt: null,
      post,
      prisma,
      status: "FAILED",
    });
    await writeAiLog({
      chunkCount: chunks.length,
      errorMessage: failure.message,
      model: process.env.OPENAI_EMBEDDING_MODEL ?? null,
      post,
      prisma,
      provider: "pipeline",
      purpose: "POST_VECTOR_SYNC",
      status: "FAILED",
    });

    return {
      ...failure,
      chunkCount: chunks.length,
      chunkIds: [],
      contentHash,
    };
  }
}

export async function deletePostVectorIndex(
  post: Pick<IndexablePost, "id" | "authorId">,
  dependencies: PipelineDependencies = {},
): Promise<VectorPipelineResult> {
  const prisma = dependencies.prisma ?? defaultPrisma;
  const vectorStore = dependencies.vectorStore ?? createChromaVectorStore();
  const existing = await prisma.postVectorIndex.findUnique({
    where: {
      postId: post.id,
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
      post,
      prisma,
      vectorStore,
    });
    await prisma.postVectorIndex.updateMany({
      where: {
        postId: post.id,
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
      message: "게시글 벡터가 삭제되었습니다.",
      chunkCount: 0,
      chunkIds: [],
      contentHash: existing?.contentHash ?? undefined,
    };
  } catch (error) {
    const failure = buildFailureResult(error);

    await writeAiLog({
      chunkCount: chunkIds.length,
      errorMessage: failure.message,
      metadata: {
        chunkIds,
      },
      post,
      prisma,
      provider: "pipeline",
      purpose: "POST_VECTOR_DELETE",
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
