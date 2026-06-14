import { describe, expect, it, vi } from "vitest";

import {
  applyRefactorResult,
  getWritingInsights,
  refreshWritingStyleProfile,
  refactorForPublication,
  rewriteInUserStyle,
} from "@/backend/writing-agent";

function createPost(overrides: Record<string, unknown> = {}) {
  return {
    content: "나는 오늘 정글에서 웹개발과 RAG를 공부했다. 기록을 남기니 생각이 정리된다.",
    createdAt: new Date(),
    excerpt: "학습 기록",
    id: "post-1",
    tags: [
      {
        tag: {
          name: "rag",
        },
      },
    ],
    title: "정글 웹개발 RAG 학습",
    ...overrides,
  };
}

function createPrismaMock() {
  const profileState: Record<string, unknown> = {};
  const refactorResults: Record<string, unknown>[] = [];

  return {
    prisma: {
      post: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            content: "원문 본문입니다. 고쳐야 할 문장입니다.",
            id: "post-1",
            title: "원문 글",
          }),
        ),
        findMany: vi.fn(() => Promise.resolve([createPost()])),
        update: vi.fn(({ data, where }) =>
          Promise.resolve({
            id: where.id,
            ...data,
          }),
        ),
      },
      writingRefactorResult: {
        create: vi.fn(({ data }) => {
          const result = {
            id: "result-1",
            ...data,
          };

          refactorResults.push(result);

          return Promise.resolve(result);
        }),
        findFirst: vi.fn(({ where }) =>
          Promise.resolve(
            refactorResults.find(
              (result) => result.id === where.id && result.ownerId === where.ownerId,
            ) ?? null,
          ),
        ),
        update: vi.fn(({ data, where }) => {
          const result = refactorResults.find((item) => item.id === where.id);

          if (result) {
            Object.assign(result, data);
          }

          return Promise.resolve(result);
        }),
      },
      writingStyleProfile: {
        findUnique: vi.fn(() =>
          Object.keys(profileState).length ? Promise.resolve(profileState) : Promise.resolve(null),
        ),
        upsert: vi.fn(({ create, update }) => {
          Object.assign(profileState, Object.keys(profileState).length ? update : create, {
            id: "profile-1",
          });

          return Promise.resolve(profileState);
        }),
      },
      $transaction: vi.fn((actions) => Promise.all(actions)),
    },
    refactorResults,
  };
}

function createGenerationClient() {
  return {
    generateAnswer: vi.fn(async ({ question }: { context: string; question: string }) => ({
      model: "test-agent-model",
      text: `generated: ${question.slice(0, 20)}`,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    })),
  };
}

describe("writing agent", () => {
  it("creates writing insights with recommendations and related posts", async () => {
    const { prisma } = createPrismaMock();
    const insights = await getWritingInsights("user-1", {
      generationClient: createGenerationClient(),
      prisma: prisma as never,
    });

    expect(insights.writingFrequency.postCount).toBe(1);
    expect(insights.topicKeywords[0]).toMatchObject({ keyword: "rag" });
    expect(insights.recommendations[0]?.relatedPosts[0]).toMatchObject({
      id: "post-1",
      title: "정글 웹개발 RAG 학습",
    });
  });

  it("refreshes style profile and rewrites text using that profile", async () => {
    const { prisma } = createPrismaMock();
    const generationClient = createGenerationClient();
    const profile = await refreshWritingStyleProfile("user-1", {
      generationClient,
      prisma: prisma as never,
    });
    const rewritten = await rewriteInUserStyle({
      dependencies: {
        generationClient,
        prisma: prisma as never,
      },
      ownerId: "user-1",
      text: "외부 텍스트입니다.",
    });

    expect(profile.toneSummary).toContain("generated:");
    expect(rewritten.rewrittenText).toContain("generated:");
  });

  it("stores publication refactor result", async () => {
    const { prisma, refactorResults } = createPrismaMock();
    const result = await refactorForPublication({
      dependencies: {
        generationClient: createGenerationClient(),
        prisma: prisma as never,
      },
      mode: "sentence",
      ownerId: "user-1",
      postId: "post-1",
    });

    expect(result).toMatchObject({
      id: "result-1",
      mode: "sentence",
      postId: "post-1",
    });
    expect(refactorResults).toHaveLength(1);
  });

  it("applies stored refactor result only to the owner post", async () => {
    const { prisma } = createPrismaMock();

    await refactorForPublication({
      dependencies: {
        generationClient: createGenerationClient(),
        prisma: prisma as never,
      },
      mode: "sentence",
      ownerId: "user-1",
      postId: "post-1",
    });

    const post = await applyRefactorResult({
      dependencies: {
        prisma: prisma as never,
        syncPostVectorIndex: vi.fn(async () => ({
          chunkCount: 1,
          chunkIds: ["post:post-1:chunk:0"],
          message: "indexed",
          status: "INDEXED",
        })),
      },
      ownerId: "user-1",
      resultId: "result-1",
    });

    expect(prisma.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          authorId: "user-1",
          id: "post-1",
        },
      }),
    );
    expect(post).toMatchObject({
      aiPipeline: {
        status: "INDEXED",
      },
      post: {
        content: expect.stringContaining("generated:"),
        id: "post-1",
      },
    });
  });
});
