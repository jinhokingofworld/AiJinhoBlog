import { describe, expect, it, vi } from "vitest";

import {
  answerMemoryQuestion,
  findDuplicateCandidates,
  searchKnowledgeSources,
} from "@/backend/rag";
import type { QueryableVectorStore } from "@/backend/ai-vector-store";

function createPrismaMock() {
  const logs: Record<string, unknown>[] = [];

  return {
    logs,
    prisma: {
      aiRequestLog: {
        create: vi.fn(({ data }) => {
          logs.push(data);

          return Promise.resolve(data);
        }),
      },
      dropboxMarkdownDocument: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: "dropbox-1",
              name: "note.md",
              pathDisplay: "/Vault/note.md",
            },
          ]),
        ),
      },
      post: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: "post-1",
              title: "AI 블로그 글",
            },
          ]),
        ),
      },
    },
  };
}

function createEmbeddingClient() {
  return {
    embedDocuments: vi.fn(async () => ({
      embeddings: [[0.1, 0.2, 0.3]],
      model: "test-embedding",
      usage: {
        inputTokens: 5,
        totalTokens: 5,
      },
    })),
  };
}

function createVectorStore(): QueryableVectorStore {
  return {
    delete: vi.fn(),
    query: vi.fn(async ({ where }) => {
      if (where?.authorId) {
        return [
          {
            distance: 0.2,
            document: "게시글 chunk",
            id: "post:post-1:hash:abc:chunk:0",
            metadata: {
              authorId: "user-1",
              postId: "post-1",
              sourceType: "POST",
            },
          },
        ];
      }

      return [
        {
          distance: 0.1,
          document: "Dropbox chunk",
          id: "dropbox-md:dropbox-1:hash:def:chunk:0",
          metadata: {
            ownerId: "user-1",
            sourceId: "dropbox-1",
            sourceType: "DROPBOX_MD",
          },
        },
      ];
    }),
    upsert: vi.fn(),
  };
}

describe("rag search and answer", () => {
  it("searches post and Dropbox vectors and hydrates source metadata", async () => {
    const { prisma } = createPrismaMock();
    const results = await searchKnowledgeSources({
      embeddingClient: createEmbeddingClient(),
      ownerId: "user-1",
      prisma: prisma as never,
      query: "AI 블로그",
      username: "jinho",
      vectorStore: createVectorStore(),
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      chunk: "Dropbox chunk",
      source: {
        path: "/Vault/note.md",
        title: "note.md",
        type: "DROPBOX_MD",
      },
    });
    expect(results[1]).toMatchObject({
      chunk: "게시글 chunk",
      source: {
        title: "AI 블로그 글",
        type: "POST",
        url: "/jinho/posts/post-1",
      },
    });
  });

  it("generates an answer with retrieved sources", async () => {
    const { logs, prisma } = createPrismaMock();
    const generationClient = {
      generateAnswer: vi.fn(
        async ({ context, question }: { context: string; question: string }) => ({
          model: "test-chat",
          text: `${question}: ${context.includes("Dropbox chunk") ? "근거 있음" : "근거 없음"}`,
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
          },
        }),
      ),
    };

    const result = await answerMemoryQuestion({
      embeddingClient: createEmbeddingClient(),
      generationClient,
      ownerId: "user-1",
      prisma: prisma as never,
      question: "무엇을 배웠지?",
      username: "jinho",
      vectorStore: createVectorStore(),
    });

    expect(result.answer).toContain("근거 있음");
    expect(result.sources).toHaveLength(2);
    expect(logs).toEqual([
      expect.objectContaining({
        purpose: "RAG_ANSWER",
        status: "SUCCESS",
      }),
    ]);
  });

  it("returns duplicate candidates from the same search pipeline", async () => {
    const { prisma } = createPrismaMock();
    const candidates = await findDuplicateCandidates({
      content: "본문",
      dependencies: {
        embeddingClient: createEmbeddingClient(),
        prisma: prisma as never,
        vectorStore: createVectorStore(),
      },
      ownerId: "user-1",
      title: "AI 블로그",
      username: "jinho",
    });

    expect(candidates.map((candidate) => candidate.source.type)).toEqual(["DROPBOX_MD", "POST"]);
  });
});
