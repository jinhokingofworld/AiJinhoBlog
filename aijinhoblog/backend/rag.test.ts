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
              plainText: "Dropbox 원문 본문",
            },
          ]),
        ),
      },
      notionPageDocument: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: "notion-1",
              plainText: "Notion 원문 본문",
              title: "Notion 페이지",
              url: "https://notion.so/page",
            },
          ]),
        ),
      },
      post: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              content: "게시글 원문 본문",
              excerpt: null,
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
        {
          distance: 0.15,
          document: "Notion chunk",
          id: "notion-page:notion-1:hash:ghi:chunk:0",
          metadata: {
            ownerId: "user-1",
            sourceId: "notion-1",
            sourceType: "NOTION_PAGE",
          },
        },
      ];
    }),
    upsert: vi.fn(),
  };
}

describe("rag search and answer", () => {
  it("searches post, Dropbox, and Notion vectors and hydrates source metadata", async () => {
    const { prisma } = createPrismaMock();
    const vectorStore = createVectorStore();
    const results = await searchKnowledgeSources({
      embeddingClient: createEmbeddingClient(),
      ownerId: "user-1",
      prisma: prisma as never,
      query: "AI 블로그",
      username: "jinho",
      vectorStore,
    });

    expect(results).toHaveLength(3);
    expect(vectorStore.query).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          authorId: "user-1",
        },
      }),
    );
    expect(vectorStore.query).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerId: "user-1",
        },
      }),
    );
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorId: "user-1",
        }),
      }),
    );
    expect(prisma.dropboxMarkdownDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerId: "user-1",
        }),
      }),
    );
    expect(prisma.notionPageDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerId: "user-1",
        }),
      }),
    );
    expect(results[0]).toMatchObject({
      chunk: "제목: AI 블로그 글 본문: 게시글 원문 본문",
      source: {
        title: "AI 블로그 글",
        type: "POST",
        url: "/jinho/posts/post-1",
      },
    });
    expect(results[1]).toMatchObject({
      chunk: "Dropbox 원문 본문",
      source: {
        path: "/Vault/note.md",
        title: "note.md",
        type: "DROPBOX_MD",
      },
    });
    expect(results[2]).toMatchObject({
      chunk: "Notion 원문 본문",
      source: {
        title: "Notion 페이지",
        type: "NOTION_PAGE",
        url: "https://notion.so/page",
      },
    });
  });

  it("reranks sources by strong title and path matches after vector search", async () => {
    const embeddingClient = createEmbeddingClient();
    const vectorStore: QueryableVectorStore = {
      delete: vi.fn(),
      query: vi.fn(async ({ where }) => {
        if (where?.authorId) {
          return [];
        }

        return [
          {
            distance: 0.98,
            document: "문서: 김진호.md\n본문: 김진호 개인 소개",
            id: "dropbox-md:person:hash:def:chunk:0",
            metadata: {
              ownerId: "user-1",
              sourceId: "person",
              sourceType: "DROPBOX_MD",
            },
          },
          {
            distance: 1.2,
            document:
              "문서: Day 1.md\n경로: /Vault/정글 웹개발 집중캠프/Day 1.md\n본문: HTML CSS JavaScript 학습",
            id: "dropbox-md:day-1:hash:def:chunk:0",
            metadata: {
              ownerId: "user-1",
              sourceId: "day-1",
              sourceType: "DROPBOX_MD",
            },
          },
        ];
      }),
      upsert: vi.fn(),
    };
    const prisma = {
      dropboxMarkdownDocument: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: "person",
              name: "김진호.md",
              pathDisplay: "/Vault/다름의 시대/김진호.md",
            },
            {
              id: "day-1",
              name: "Day 1.md",
              pathDisplay: "/Vault/정글 웹개발 집중캠프/Day 1.md",
            },
          ]),
        ),
      },
      notionPageDocument: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
      post: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    };

    const results = await searchKnowledgeSources({
      embeddingClient,
      ownerId: "user-1",
      prisma: prisma as never,
      query: "작년 정글 웹개발 집중캠프에서 김진호는 뭘 했을까?",
      username: "jinho",
      vectorStore,
    });

    expect(results[0]?.source).toMatchObject({
      path: "/Vault/정글 웹개발 집중캠프/Day 1.md",
      title: "Day 1.md",
    });
    expect(results[1]?.source).toMatchObject({
      title: "김진호.md",
    });
  });

  it("expands bootcamp terms and filters weak path-only matches", async () => {
    const embeddingClient = createEmbeddingClient();
    const vectorStore: QueryableVectorStore = {
      delete: vi.fn(),
      query: vi.fn(async ({ where }) => {
        if (where?.authorId) {
          return [];
        }

        return [
          {
            distance: 0.9,
            document:
              "문서: 화가.md\n경로: /Apps/remotely-save/크래프톤_정글/기타/화가.md\n본문: 렘브란트 엘글레코 벨레스케스 마네",
            id: "dropbox-md:painter:hash:def:chunk:0",
            metadata: {
              ownerId: "user-1",
              sourceId: "painter",
              sourceType: "DROPBOX_MD",
            },
          },
          {
            distance: 1.48,
            document:
              "문서: Day 1.md\n경로: /Vault/정글 웹개발 집중캠프/Day 1.md\n본문: HTML CSS JavaScript 학습",
            id: "dropbox-md:day-1:hash:def:chunk:0",
            metadata: {
              ownerId: "user-1",
              sourceId: "day-1",
              sourceType: "DROPBOX_MD",
            },
          },
        ];
      }),
      upsert: vi.fn(),
    };
    const prisma = {
      dropboxMarkdownDocument: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: "painter",
              name: "화가.md",
              pathDisplay: "/Apps/remotely-save/크래프톤_정글/기타/화가.md",
            },
            {
              id: "day-1",
              name: "Day 1.md",
              pathDisplay: "/Vault/정글 웹개발 집중캠프/Day 1.md",
            },
          ]),
        ),
      },
      notionPageDocument: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
      post: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    };

    const results = await searchKnowledgeSources({
      embeddingClient,
      ownerId: "user-1",
      prisma: prisma as never,
      query: "김진호는 정글 부트캠프에서 뭘 했을까?",
      username: "jinho",
      vectorStore,
    });

    expect(results.map((result) => result.source.title)).toEqual(["Day 1.md"]);
  });

  it("generates an answer with retrieved sources", async () => {
    const { logs, prisma } = createPrismaMock();
    const generationClient = {
      generateAnswer: vi.fn(
        async ({ context, question }: { context: string; question: string }) => ({
          model: "test-chat",
          text: `${question}: ${context.includes("Dropbox 원문 본문") ? "근거 있음" : "근거 없음"}`,
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
    expect(result.sources).toHaveLength(3);
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

    expect(candidates.map((candidate) => candidate.source.type)).toEqual([
      "POST",
      "DROPBOX_MD",
      "NOTION_PAGE",
    ]);
  });
});
