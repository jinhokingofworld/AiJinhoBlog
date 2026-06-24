import type { Prisma, PrismaClient } from "@/backend/generated/prisma";

import {
  syncPostVectorIndex as defaultSyncPostVectorIndex,
  type VectorPipelineResult,
} from "@/backend/ai/indexing";
import {
  GenerationProviderError,
  GenerationSkippedError,
  createOpenAIGenerationClient,
  type GenerationClient,
} from "@/backend/ai/generation";
import { normalizeKnowledgeText } from "@/backend/ai/text";
import { prisma as defaultPrisma } from "@/backend/core/prisma";

type AgentDependencies = {
  generationClient?: GenerationClient;
  prisma?: PrismaClient;
  syncPostVectorIndex?: typeof defaultSyncPostVectorIndex;
};

// 글쓰기 Agent의 서버 도메인 로직입니다.
// 실제 LLM 호출은 generationClient.generateAnswer(...)에 모이고, API route들은 이 파일의 함수만 호출합니다.
const STYLE_PROFILE_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

type RecentPost = {
  content: string;
  createdAt: Date;
  excerpt: string | null;
  id: string;
  title: string;
  tags: Array<{
    tag: {
      name: string;
    };
  }>;
};

export type WritingRecommendation = {
  reason: string;
  relatedPosts: Array<{
    id: string;
    title: string;
  }>;
  title: string;
};

export class WritingAgentError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "WritingAgentError";
    this.status = status;
  }
}

function getRecentWindowStart(days = 30) {
  const date = new Date();

  date.setDate(date.getDate() - days);

  return date;
}

function createPostSnippet(post: Pick<RecentPost, "content" | "excerpt" | "title">) {
  return normalizeKnowledgeText(
    [`제목: ${post.title}`, post.excerpt ? `요약: ${post.excerpt}` : null, post.content]
      .filter(Boolean)
      .join("\n\n"),
  ).slice(0, 1200);
}

function extractTitleKeywords(posts: RecentPost[]) {
  const counts = new Map<string, number>();

  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag.tag.name, (counts.get(tag.tag.name) ?? 0) + 3);
    }

    for (const token of normalizeKnowledgeText(post.title).split(/\s+/)) {
      const normalized = token.replace(/[^\p{Letter}\p{Number}-]/gu, "").toLowerCase();

      if (normalized.length < 2) {
        continue;
      }

      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([keyword, count]) => ({ count, keyword }));
}

function createDeterministicRecommendations(posts: RecentPost[]): WritingRecommendation[] {
  const keywords = extractTitleKeywords(posts);
  const recentPosts = posts.slice(0, 5).map((post) => ({
    id: post.id,
    title: post.title,
  }));

  if (!keywords.length) {
    return [
      {
        reason: "아직 주제 데이터가 적어서 블로그의 시작점과 방향성을 정리하는 글이 적합합니다.",
        relatedPosts: recentPosts,
        title: "지금 기록하고 싶은 주제 정리",
      },
    ];
  }

  return keywords.slice(0, 5).map(({ keyword }, index) => ({
    reason: `"${keyword}" 주제가 최근 글과 태그에서 반복적으로 나타납니다. 기존 기록을 확장하되 같은 제목을 반복하지 않는 방향이 좋습니다.`,
    relatedPosts: recentPosts.slice(index, index + 2).length
      ? recentPosts.slice(index, index + 2)
      : recentPosts.slice(0, 2),
    title: `${keyword}에 대해 아직 정리하지 않은 관점`,
  }));
}

async function maybeGenerateAgentSummary({
  generationClient,
  posts,
  recommendations,
}: {
  generationClient: GenerationClient;
  posts: RecentPost[];
  recommendations: WritingRecommendation[];
}) {
  try {
    const generated = await generationClient.generateAnswer({
      context: [
        "최근 글:",
        ...posts.slice(0, 8).map((post, index) => `[${index + 1}] ${createPostSnippet(post)}`),
        "추천 후보:",
        ...recommendations.map((item, index) => `[${index + 1}] ${item.title}: ${item.reason}`),
      ].join("\n\n"),
      question: "최근 작성 활동의 관심 주제 변화와 글감 추천 방향을 5문장 이내로 요약해줘.",
    });

    return {
      model: generated.model,
      text: generated.text,
    };
  } catch (error) {
    if (error instanceof GenerationSkippedError) {
      return {
        model: null,
        text: error.message,
      };
    }

    throw error;
  }
}

export async function getWritingInsights(ownerId: string, dependencies: AgentDependencies = {}) {
  // 관심 주제/글감 추천 흐름입니다.
  // 최근 글과 태그를 기반으로 deterministic 추천을 먼저 만들고, 가능하면 LLM이 요약 설명을 덧붙입니다.
  const prisma = dependencies.prisma ?? defaultPrisma;
  const generationClient = dependencies.generationClient ?? createOpenAIGenerationClient();
  const posts = await prisma.post.findMany({
    where: {
      authorId: ownerId,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 30,
  });
  const recentWindowStart = getRecentWindowStart();
  const recentPostCount = posts.filter((post) => post.createdAt >= recentWindowStart).length;
  const keywords = extractTitleKeywords(posts);
  const recommendations = createDeterministicRecommendations(posts);
  const summary = await maybeGenerateAgentSummary({
    generationClient,
    posts,
    recommendations,
  });

  return {
    recommendations,
    summary,
    topicKeywords: keywords,
    writingFrequency: {
      days: 30,
      postCount: recentPostCount,
    },
  };
}

function createFrequentExpressions(posts: RecentPost[]) {
  const counts = new Map<string, number>();

  for (const post of posts) {
    const text = normalizeKnowledgeText(post.content);
    const phrases = text.match(/[가-힣A-Za-z0-9][^.!?\n]{2,24}[.!?]/g) ?? [];

    for (const phrase of phrases.slice(0, 20)) {
      const normalized = phrase.trim();

      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([expression, count]) => ({ count, expression }));
}

function createSentenceSummary(posts: RecentPost[]) {
  const sentences = posts
    .flatMap((post) => normalizeKnowledgeText(post.content).split(/[.!?\n]+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const averageLength = sentences.length
    ? Math.round(sentences.reduce((sum, sentence) => sum + sentence.length, 0) / sentences.length)
    : 0;

  return averageLength
    ? `평균 문장 길이는 약 ${averageLength}자이며, ${averageLength > 60 ? "긴 호흡의 설명형 문장" : "짧고 직접적인 문장"}이 중심입니다.`
    : "문장 길이를 분석할 게시글이 충분하지 않습니다.";
}

async function createToneSummary(posts: RecentPost[], generationClient: GenerationClient) {
  const deterministic =
    "개인 기록과 학습 내용을 중심으로 경험, 생각, 정리를 함께 남기는 문체입니다.";

  if (!posts.length) {
    return deterministic;
  }

  try {
    // 문체 프로파일의 핵심 AI 호출입니다.
    // 최근 글 샘플을 context로 넣고 어조/문장 습관/관점을 요약합니다.
    const generated = await generationClient.generateAnswer({
      context: posts
        .slice(0, 8)
        .map((post, index) => `[${index + 1}] ${createPostSnippet(post)}`)
        .join("\n\n"),
      question:
        "이 글들의 어조, 문장 습관, 자주 드러나는 관점을 문체 프로파일로 5문장 이내로 정리해줘.",
    });

    return generated.text;
  } catch (error) {
    if (error instanceof GenerationSkippedError) {
      return deterministic;
    }

    throw error;
  }
}

export async function refreshWritingStyleProfile(
  ownerId: string,
  dependencies: AgentDependencies = {},
) {
  // 문체 프로파일 생성/갱신 흐름입니다.
  // LLM 기반 toneSummary와 deterministic sentence/frequent expression 분석을 DB에 upsert합니다.
  const prisma = dependencies.prisma ?? defaultPrisma;
  const generationClient = dependencies.generationClient ?? createOpenAIGenerationClient();
  const posts = await prisma.post.findMany({
    where: {
      authorId: ownerId,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });
  const toneSummary = await createToneSummary(posts, generationClient);
  const sentenceSummary = createSentenceSummary(posts);
  const frequentExpressions = createFrequentExpressions(posts);
  const samplePostIds = posts.slice(0, 10).map((post) => post.id);

  return prisma.writingStyleProfile.upsert({
    where: {
      ownerId,
    },
    create: {
      frequentExpressions: frequentExpressions as Prisma.InputJsonValue,
      lastAnalyzedAt: new Date(),
      ownerId,
      samplePostIds: samplePostIds as Prisma.InputJsonValue,
      sentenceSummary,
      toneSummary,
    },
    update: {
      frequentExpressions: frequentExpressions as Prisma.InputJsonValue,
      lastAnalyzedAt: new Date(),
      samplePostIds: samplePostIds as Prisma.InputJsonValue,
      sentenceSummary,
      toneSummary,
    },
  });
}

export async function getWritingStyleProfile(
  ownerId: string,
  dependencies: Pick<AgentDependencies, "prisma"> = {},
) {
  const prisma = dependencies.prisma ?? defaultPrisma;

  return prisma.writingStyleProfile.findUnique({
    where: {
      ownerId,
    },
  });
}

function shouldRefreshStyleProfile(profile: { lastAnalyzedAt: Date } | null) {
  if (!profile) {
    return true;
  }

  return Date.now() - profile.lastAnalyzedAt.getTime() > STYLE_PROFILE_REFRESH_INTERVAL_MS;
}

export async function rewriteInUserStyle({
  ownerId,
  text,
  dependencies = {},
}: {
  dependencies?: AgentDependencies;
  ownerId: string;
  text: string;
}) {
  // 내 문체로 다시쓰기 흐름입니다.
  // 오래된 profile이면 먼저 갱신하고, profile 내용을 prompt context로 넣어 입력 text를 재작성합니다.
  const generationClient = dependencies.generationClient ?? createOpenAIGenerationClient();
  const currentProfile = await getWritingStyleProfile(ownerId, dependencies);
  let profile = currentProfile;

  if (shouldRefreshStyleProfile(profile)) {
    profile = await refreshWritingStyleProfile(ownerId, dependencies);
  }

  if (!profile) {
    throw new WritingAgentError("문체 프로파일을 생성할 수 없습니다.", 502);
  }

  const generated = await generationClient.generateAnswer({
    context: [
      `어조: ${profile.toneSummary}`,
      `문장: ${profile.sentenceSummary}`,
      `자주 쓰는 표현: ${JSON.stringify(profile.frequentExpressions ?? [])}`,
    ].join("\n"),
    question: `다음 원문을 사용자 문체에 가깝게 재작성해줘. 의미는 유지하고 과장하지 마.\n\n${text}`,
  });

  return {
    model: generated.model,
    originalText: text,
    rewrittenText: generated.text,
  };
}

export async function refactorForPublication({
  mode,
  ownerId,
  postId,
  text,
  dependencies = {},
}: {
  dependencies?: AgentDependencies;
  mode: "expression" | "sentence" | "structure";
  ownerId: string;
  postId?: string | null;
  text?: string | null;
}) {
  // 게시글 리팩토링 흐름입니다.
  // 원본 게시글 또는 직접 입력 text를 LLM에 보내되, 결과를 즉시 Post에 반영하지 않고 WritingRefactorResult로 저장합니다.
  const prisma = dependencies.prisma ?? defaultPrisma;
  const generationClient = dependencies.generationClient ?? createOpenAIGenerationClient();
  const post = postId
    ? await prisma.post.findFirst({
        where: {
          authorId: ownerId,
          id: postId,
        },
        select: {
          content: true,
          id: true,
          title: true,
        },
      })
    : null;
  const originalText = text?.trim() || post?.content || "";

  if (!originalText) {
    throw new WritingAgentError("리팩토링할 본문이 필요합니다.", 400);
  }

  const generated = await generationClient.generateAnswer({
    context: originalText,
    question: [
      "본문을 출판 가능한 수준으로 리팩토링해줘.",
      `개선 모드: ${mode}`,
      "요구사항:",
      "- 원문의 핵심 의미 유지",
      "- 구조, 문장, 표현 중 선택한 모드에 집중",
      "- 결과 본문만 먼저 작성하고 마지막에 변경 요약을 덧붙임",
    ].join("\n"),
  });
  const result = await prisma.writingRefactorResult.create({
    data: {
      changeSummary: `mode=${mode}, model=${generated.model}`,
      mode,
      originalText,
      ownerId,
      postId: post?.id ?? null,
      revisedText: generated.text,
    },
  });

  return result;
}

export async function applyRefactorResult({
  ownerId,
  resultId,
  dependencies = {},
}: {
  dependencies?: Pick<AgentDependencies, "prisma" | "syncPostVectorIndex">;
  ownerId: string;
  resultId: string;
}) {
  // 리팩토링 결과 적용 흐름입니다.
  // 저장된 revisedText를 실제 게시글 content에 반영한 뒤, RAG 검색 결과가 최신화되도록 벡터를 재인덱싱합니다.
  const prisma = dependencies.prisma ?? defaultPrisma;
  const syncPostVectorIndex = dependencies.syncPostVectorIndex ?? defaultSyncPostVectorIndex;
  const result = await prisma.writingRefactorResult.findFirst({
    where: {
      id: resultId,
      ownerId,
    },
  });

  if (!result) {
    throw new WritingAgentError("리팩토링 결과를 찾을 수 없습니다.", 404);
  }

  if (!result.postId) {
    throw new WritingAgentError("게시글에 연결된 리팩토링 결과만 반영할 수 있습니다.", 400);
  }

  const targetPost = await prisma.post.findFirst({
    where: {
      authorId: ownerId,
      id: result.postId,
    },
    select: {
      id: true,
    },
  });

  if (!targetPost) {
    throw new WritingAgentError("게시글을 찾을 수 없습니다.", 404);
  }

  const [post] = await prisma.$transaction([
    prisma.post.update({
      where: {
        id: targetPost.id,
      },
      data: {
        content: result.revisedText,
      },
    }),
    prisma.writingRefactorResult.update({
      where: {
        id: result.id,
      },
      data: {
        appliedAt: new Date(),
      },
    }),
  ]);
  const aiPipeline: VectorPipelineResult = await syncPostVectorIndex(post);

  return {
    aiPipeline,
    post,
  };
}

export function toWritingAgentErrorResponse(error: unknown) {
  if (error instanceof WritingAgentError) {
    return {
      message: error.message,
      status: error.status,
    };
  }

  if (error instanceof GenerationSkippedError) {
    return {
      message: error.message,
      status: 503,
    };
  }

  if (error instanceof GenerationProviderError) {
    return {
      message: error.message,
      status: error.status && error.status >= 400 && error.status < 500 ? 400 : 502,
    };
  }

  return {
    message: "AI Agent 요청 처리에 실패했습니다.",
    status: 502,
  };
}
