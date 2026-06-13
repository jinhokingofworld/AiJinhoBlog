import type { Prisma, PrismaClient } from "@/backend/generated/prisma";

import {
  EmbeddingProviderError,
  EmbeddingSkippedError,
  createOpenAIEmbeddingClient,
  type EmbeddingClient,
} from "@/backend/ai-embedding";
import {
  GenerationProviderError,
  GenerationSkippedError,
  createOpenAIGenerationClient,
  type GenerationClient,
} from "@/backend/ai-generation";
import {
  ChromaVectorStoreError,
  createChromaVectorStore,
  type QueryableVectorStore,
  type VectorQueryMatch,
} from "@/backend/ai-vector-store";
import { buildPostIndexText, normalizeKnowledgeText } from "@/backend/ai-text";
import { prisma as defaultPrisma } from "@/backend/prisma";

export type KnowledgeSourceType = "DROPBOX_MD" | "POST";

export type KnowledgeSearchResult = {
  chunk: string;
  chunkId: string;
  distance: number | null;
  score: number | null;
  source: {
    id: string;
    path: string | null;
    title: string;
    type: KnowledgeSourceType;
    url: string | null;
  };
};

export type RagAnswerResult = {
  answer: string;
  model: string | null;
  question: string;
  sources: KnowledgeSearchResult[];
};

type RagDependencies = {
  embeddingClient?: EmbeddingClient;
  generationClient?: GenerationClient;
  prisma?: PrismaClient;
  vectorStore?: QueryableVectorStore;
};

type HydratedSource = {
  id: string;
  path: string | null;
  title: string;
  type: KnowledgeSourceType;
  url: string | null;
};

const DEFAULT_SEARCH_LIMIT = 6;
const MAX_SEARCH_LIMIT = 12;
const MAX_CONTEXT_CHARS = 12_000;

function clampLimit(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_SEARCH_LIMIT;
  }

  return Math.min(Math.max(1, Math.floor(value)), MAX_SEARCH_LIMIT);
}

function createScore(distance: number | null) {
  if (distance === null || !Number.isFinite(distance)) {
    return null;
  }

  return Number((1 / (1 + Math.max(0, distance))).toFixed(4));
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readSourceType(match: VectorQueryMatch): KnowledgeSourceType | null {
  const sourceType = readString(match.metadata.sourceType);

  if (sourceType === "DROPBOX_MD" || match.id.startsWith("dropbox-md:")) {
    return "DROPBOX_MD";
  }

  if (sourceType === "POST" || match.id.startsWith("post:")) {
    return "POST";
  }

  return null;
}

function readSourceId(match: VectorQueryMatch, sourceType: KnowledgeSourceType) {
  if (sourceType === "POST") {
    return readString(match.metadata.postId) ?? readString(match.metadata.sourceId);
  }

  return readString(match.metadata.sourceId);
}

function sortMatches(matches: VectorQueryMatch[]) {
  return [...matches].sort((a, b) => {
    if (a.distance === null && b.distance === null) {
      return 0;
    }

    if (a.distance === null) {
      return 1;
    }

    if (b.distance === null) {
      return -1;
    }

    return a.distance - b.distance;
  });
}

async function hydrateSources({
  matches,
  ownerId,
  prisma,
  username,
}: {
  matches: VectorQueryMatch[];
  ownerId: string;
  prisma: PrismaClient;
  username: string;
}) {
  const postIds = new Set<string>();
  const dropboxIds = new Set<string>();

  for (const match of matches) {
    const sourceType = readSourceType(match);

    if (!sourceType) {
      continue;
    }

    const sourceId = readSourceId(match, sourceType);

    if (!sourceId) {
      continue;
    }

    if (sourceType === "POST") {
      postIds.add(sourceId);
    } else {
      dropboxIds.add(sourceId);
    }
  }

  const [posts, dropboxDocuments] = await Promise.all([
    postIds.size
      ? prisma.post.findMany({
          where: {
            authorId: ownerId,
            id: {
              in: [...postIds],
            },
          },
          select: {
            id: true,
            title: true,
          },
        })
      : Promise.resolve([]),
    dropboxIds.size
      ? prisma.dropboxMarkdownDocument.findMany({
          where: {
            id: {
              in: [...dropboxIds],
            },
            ownerId,
          },
          select: {
            id: true,
            name: true,
            pathDisplay: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const hydrated = new Map<string, HydratedSource>();

  for (const post of posts) {
    hydrated.set(`POST:${post.id}`, {
      id: post.id,
      path: null,
      title: post.title,
      type: "POST",
      url: `/${username}/posts/${post.id}`,
    });
  }

  for (const document of dropboxDocuments) {
    hydrated.set(`DROPBOX_MD:${document.id}`, {
      id: document.id,
      path: document.pathDisplay,
      title: document.name,
      type: "DROPBOX_MD",
      url: null,
    });
  }

  return hydrated;
}

function toSearchResult(match: VectorQueryMatch, source: HydratedSource): KnowledgeSearchResult {
  return {
    chunk: match.document,
    chunkId: match.id,
    distance: match.distance,
    score: createScore(match.distance),
    source,
  };
}

function createContext(results: KnowledgeSearchResult[]) {
  let context = "";

  for (const [index, result] of results.entries()) {
    const label =
      result.source.type === "POST"
        ? `게시글: ${result.source.title} (${result.source.url})`
        : `Dropbox: ${result.source.title} (${result.source.path})`;
    const next = `[${index + 1}] ${label}\n${result.chunk}\n\n`;

    if (context.length + next.length > MAX_CONTEXT_CHARS) {
      break;
    }

    context += next;
  }

  return context.trim();
}

function toFailureLogContext(error: unknown) {
  if (error instanceof EmbeddingProviderError) {
    return {
      metadata: {
        durationMs: error.durationMs,
        retryAttempts: error.retryAttempts,
        status: error.status,
      },
      model: process.env.OPENAI_EMBEDDING_MODEL ?? null,
      provider: "openai",
      purpose: "RAG_QUERY_EMBEDDING",
    };
  }

  if (error instanceof GenerationProviderError) {
    return {
      metadata: {
        durationMs: error.durationMs,
        retryAttempts: error.retryAttempts,
        status: error.status,
      },
      model: process.env.OPENAI_RAG_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? null,
      provider: "openai",
      purpose: "RAG_ANSWER",
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
      purpose: "RAG_VECTOR_QUERY",
    };
  }

  return {
    metadata: {},
    model: null,
    provider: "pipeline",
    purpose: "RAG_PIPELINE",
  };
}

async function writeRagLog({
  errorMessage,
  inputTokens,
  metadata,
  model,
  outputTokens,
  prisma,
  provider,
  purpose,
  status,
  totalTokens,
  userId,
}: {
  errorMessage?: string;
  inputTokens?: number | null;
  metadata?: Record<string, unknown>;
  model?: string | null;
  outputTokens?: number | null;
  prisma: PrismaClient;
  provider: string;
  purpose: string;
  status: "FAILED" | "SKIPPED" | "SUCCESS";
  totalTokens?: number | null;
  userId: string;
}) {
  await prisma.aiRequestLog.create({
    data: {
      errorMessage,
      inputTokens,
      metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      model,
      outputTokens,
      provider,
      purpose,
      status,
      totalTokens,
      userId,
    },
  });
}

export async function searchKnowledgeSources({
  limit,
  ownerId,
  prisma = defaultPrisma,
  query,
  username,
  vectorStore = createChromaVectorStore(),
  embeddingClient = createOpenAIEmbeddingClient(),
}: {
  limit?: number;
  ownerId: string;
  prisma?: PrismaClient;
  query: string;
  username: string;
} & Pick<RagDependencies, "embeddingClient" | "vectorStore">) {
  const normalizedQuery = normalizeKnowledgeText(query);

  if (!normalizedQuery) {
    return [];
  }

  const safeLimit = clampLimit(limit);
  const embedding = await embeddingClient.embedDocuments([normalizedQuery]);
  const [postMatches, dropboxMatches] = await Promise.all([
    vectorStore.query({
      embedding: embedding.embeddings[0],
      limit: safeLimit,
      where: {
        authorId: ownerId,
      },
    }),
    vectorStore.query({
      embedding: embedding.embeddings[0],
      limit: safeLimit,
      where: {
        ownerId,
      },
    }),
  ]);
  const matches = sortMatches([...postMatches, ...dropboxMatches]).slice(0, safeLimit);
  const hydrated = await hydrateSources({
    matches,
    ownerId,
    prisma,
    username,
  });

  return matches
    .map((match) => {
      const sourceType = readSourceType(match);
      const sourceId = sourceType ? readSourceId(match, sourceType) : null;
      const source = sourceType && sourceId ? hydrated.get(`${sourceType}:${sourceId}`) : null;

      return source ? toSearchResult(match, source) : null;
    })
    .filter((result): result is KnowledgeSearchResult => Boolean(result));
}

export async function answerMemoryQuestion({
  generationClient = createOpenAIGenerationClient(),
  limit,
  ownerId,
  prisma = defaultPrisma,
  question,
  username,
  vectorStore,
  embeddingClient,
}: {
  limit?: number;
  ownerId: string;
  question: string;
  username: string;
} & RagDependencies): Promise<RagAnswerResult> {
  try {
    const sources = await searchKnowledgeSources({
      embeddingClient,
      limit,
      ownerId,
      prisma,
      query: question,
      username,
      vectorStore,
    });

    if (!sources.length) {
      await writeRagLog({
        errorMessage: "검색된 근거가 없습니다.",
        metadata: {
          question,
        },
        model: null,
        prisma,
        provider: "pipeline",
        purpose: "RAG_ANSWER",
        status: "SKIPPED",
        userId: ownerId,
      });

      return {
        answer: "질문과 관련된 게시글이나 Dropbox Markdown 근거를 찾지 못했습니다.",
        model: null,
        question,
        sources: [],
      };
    }

    const generated = await generationClient.generateAnswer({
      context: createContext(sources),
      question,
    });

    await writeRagLog({
      inputTokens: generated.usage.inputTokens,
      metadata: {
        question,
        sourceCount: sources.length,
        sourceIds: sources.map((source) => source.source.id),
      },
      model: generated.model,
      outputTokens: generated.usage.outputTokens,
      prisma,
      provider: "openai",
      purpose: "RAG_ANSWER",
      status: "SUCCESS",
      totalTokens: generated.usage.totalTokens,
      userId: ownerId,
    });

    return {
      answer: generated.text,
      model: generated.model,
      question,
      sources,
    };
  } catch (error) {
    if (error instanceof EmbeddingSkippedError || error instanceof GenerationSkippedError) {
      await writeRagLog({
        errorMessage: error.message,
        metadata: {
          question,
        },
        model: null,
        prisma,
        provider: "openai",
        purpose: "RAG_ANSWER",
        status: "SKIPPED",
        userId: ownerId,
      });
    } else {
      const context = toFailureLogContext(error);

      await writeRagLog({
        errorMessage: error instanceof Error ? error.message : "RAG 답변 생성에 실패했습니다.",
        metadata: {
          question,
          ...context.metadata,
        },
        model: context.model,
        prisma,
        provider: context.provider,
        purpose: context.purpose,
        status: "FAILED",
        userId: ownerId,
      });
    }

    throw error;
  }
}

export async function findDuplicateCandidates({
  content,
  excerpt,
  limit = 5,
  ownerId,
  title,
  username,
  dependencies = {},
}: {
  content: string;
  dependencies?: Pick<RagDependencies, "embeddingClient" | "prisma" | "vectorStore">;
  excerpt?: string | null;
  limit?: number;
  ownerId: string;
  title: string;
  username: string;
}) {
  return searchKnowledgeSources({
    ...dependencies,
    limit,
    ownerId,
    query: buildPostIndexText({
      content,
      excerpt: excerpt ?? null,
      title,
    }),
    username,
  });
}
