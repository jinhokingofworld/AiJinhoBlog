import { describe, expect, it } from "vitest";

import { EmbeddingSkippedError, type EmbeddingClient } from "@/lib/ai-embedding";
import { deletePostVectorIndex, syncPostVectorIndex, type IndexablePost } from "@/lib/ai-indexing";
import {
  buildPostIndexText,
  createPostContentHash,
  normalizeKnowledgeText,
  splitTextIntoChunks,
} from "@/lib/ai-text";
import type { VectorStore } from "@/lib/ai-vector-store";

function createPost(overrides: Partial<IndexablePost> = {}): IndexablePost {
  return {
    id: "post-1",
    authorId: "user-1",
    title: "AI 블로그 글",
    excerpt: "요약 텍스트",
    content: "본문 텍스트입니다. 벡터 저장 테스트를 위한 충분한 길이의 글입니다.",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    folderId: "folder-1",
    ...overrides,
  };
}

function createPrismaMock(existingChunkIds: string[] = []) {
  const state: {
    logs: unknown[];
    vectorIndex: Record<string, unknown> | null;
  } = {
    logs: [],
    vectorIndex: existingChunkIds.length
      ? {
          postId: "post-1",
          authorId: "user-1",
          status: "INDEXED",
          chunkIds: existingChunkIds,
          contentHash: "old-hash",
        }
      : null,
  };
  const prisma = {
    postVectorIndex: {
      async findUnique() {
        return state.vectorIndex;
      },
      async upsert({
        create,
        update,
      }: {
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        state.vectorIndex = state.vectorIndex ? { ...state.vectorIndex, ...update } : create;
        return state.vectorIndex;
      },
      async updateMany({ data }: { data: Record<string, unknown> }) {
        if (state.vectorIndex) {
          state.vectorIndex = { ...state.vectorIndex, ...data };
          return { count: 1 };
        }

        return { count: 0 };
      },
    },
    aiRequestLog: {
      async create({ data }: { data: Record<string, unknown> }) {
        state.logs.push(data);
        return data;
      },
    },
  };

  return {
    prisma,
    state,
  };
}

function createEmbeddingClient(embedding: number[] = [0.1, 0.2, 0.3]): EmbeddingClient {
  return {
    async embedDocuments(texts) {
      return {
        embeddings: texts.map(() => embedding),
        model: "test-embedding-model",
        usage: {
          inputTokens: 10,
          totalTokens: 10,
        },
      };
    },
  };
}

function createVectorStore(options: { failUpsert?: boolean } = {}) {
  const state: {
    deleted: string[];
    upserted: unknown[];
  } = {
    deleted: [],
    upserted: [],
  };
  const vectorStore: VectorStore = {
    async delete(ids) {
      state.deleted.push(...ids);
    },
    async upsert(records) {
      if (options.failUpsert) {
        throw new Error("ChromaDB 저장 실패");
      }

      state.upserted.push(...records);
    },
  };

  return {
    state,
    vectorStore,
  };
}

describe("ai text preprocessing", () => {
  it("normalizes markdown and html into knowledge text", () => {
    expect(normalizeKnowledgeText("# 제목<br><p>**본문** [링크](https://example.com)</p>")).toBe(
      "제목\n 본문 링크",
    );
  });

  it("builds post index text from title, excerpt, and content", () => {
    expect(buildPostIndexText(createPost())).toContain("제목: AI 블로그 글");
    expect(buildPostIndexText(createPost())).toContain("요약: 요약 텍스트");
    expect(buildPostIndexText(createPost())).toContain("본문: 본문 텍스트입니다.");
  });

  it("splits long text into bounded chunks", () => {
    const chunks = splitTextIntoChunks("가".repeat(25), {
      maxLength: 10,
      overlap: 2,
    });

    expect(chunks).toEqual(["가".repeat(10), "가".repeat(10), "가".repeat(9)]);
  });

  it("changes content hash when searchable post state changes", () => {
    const base = createPostContentHash(createPost());
    const changed = createPostContentHash(createPost({ visibility: "PRIVATE" }));

    expect(base).not.toBe(changed);
  });
});

describe("ai indexing pipeline", () => {
  it("indexes post chunks and replaces previous vectors", async () => {
    const { prisma, state } = createPrismaMock(["old-1"]);
    const { state: vectorState, vectorStore } = createVectorStore();
    const result = await syncPostVectorIndex(createPost(), {
      embeddingClient: createEmbeddingClient(),
      prisma: prisma as never,
      vectorStore,
    });

    expect(result.status).toBe("INDEXED");
    expect(vectorState.deleted).toEqual(["old-1"]);
    expect(vectorState.upserted).toHaveLength(result.chunkCount);
    expect(state.vectorIndex?.status).toBe("INDEXED");
    expect(state.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "openai", status: "SUCCESS" }),
        expect.objectContaining({ provider: "chromadb", status: "SUCCESS" }),
      ]),
    );
  });

  it("records skipped status when embedding config is missing", async () => {
    const { prisma, state } = createPrismaMock();
    const { vectorStore } = createVectorStore();
    const result = await syncPostVectorIndex(createPost(), {
      embeddingClient: {
        async embedDocuments() {
          throw new EmbeddingSkippedError("OPENAI_API_KEY가 없어 embedding 생성을 건너뜁니다.");
        },
      },
      prisma: prisma as never,
      vectorStore,
    });

    expect(result.status).toBe("SKIPPED");
    expect(state.vectorIndex?.status).toBe("SKIPPED");
    expect(state.logs).toEqual([
      expect.objectContaining({
        provider: "openai",
        status: "SKIPPED",
      }),
    ]);
  });

  it("records failed status when vector storage fails", async () => {
    const { prisma, state } = createPrismaMock();
    const { vectorStore } = createVectorStore({ failUpsert: true });
    const result = await syncPostVectorIndex(createPost(), {
      embeddingClient: createEmbeddingClient(),
      prisma: prisma as never,
      vectorStore,
    });

    expect(result.status).toBe("FAILED");
    expect(result.message).toBe("ChromaDB 저장 실패");
    expect(state.vectorIndex?.status).toBe("FAILED");
    expect(state.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "openai", status: "SUCCESS" }),
        expect.objectContaining({ provider: "pipeline", status: "FAILED" }),
      ]),
    );
  });

  it("deletes stored vectors before post deletion", async () => {
    const { prisma, state } = createPrismaMock(["chunk-1", "chunk-2"]);
    const { state: vectorState, vectorStore } = createVectorStore();
    const result = await deletePostVectorIndex(
      {
        id: "post-1",
        authorId: "user-1",
      },
      {
        prisma: prisma as never,
        vectorStore,
      },
    );

    expect(result.status).toBe("DELETED");
    expect(vectorState.deleted).toEqual(["chunk-1", "chunk-2"]);
    expect(state.vectorIndex?.status).toBe("DELETED");
  });
});
