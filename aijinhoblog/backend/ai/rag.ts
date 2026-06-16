import type { Prisma, PrismaClient } from "@/backend/generated/prisma";

import {
  EmbeddingProviderError,
  EmbeddingSkippedError,
  createOpenAIEmbeddingClient,
  type EmbeddingClient,
} from "@/backend/ai/embedding";
import {
  GenerationProviderError,
  GenerationSkippedError,
  createOpenAIGenerationClient,
  type GenerationClient,
} from "@/backend/ai/generation";
import {
  ChromaVectorStoreError,
  createChromaVectorStore,
  type QueryableVectorStore,
  type VectorQueryMatch,
} from "@/backend/ai/vector-store";
import { buildPostIndexText, normalizeKnowledgeText } from "@/backend/ai/text";
import { prisma as defaultPrisma } from "@/backend/core/prisma";

export type KnowledgeSourceType = "DROPBOX_MD" | "NOTION_PAGE" | "POST";

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

// RAG 파이프라인의 중심 파일입니다.
// 검색 흐름: 질문 정규화 -> 질문 embedding -> ChromaDB query -> DB에서 source metadata 보강 -> hybrid score 정렬.
// 답변 흐름: 검색 결과를 context로 묶기 -> OpenAI generation 호출 -> AiRequestLog 기록.
type HydratedSource = {
  contentText: string | null;
  id: string;
  path: string | null;
  title: string;
  type: KnowledgeSourceType;
  url: string | null;
};

const DEFAULT_SEARCH_LIMIT = 6;
const MAX_SEARCH_LIMIT = 12;
const MAX_CANDIDATE_LIMIT = 48;
const MAX_CONTEXT_CHARS = 12_000;
const KOREAN_PARTICLE_SUFFIX_PATTERN =
  /(으로서|으로써|에게서|한테서|에서|에게|한테|부터|까지|보다|처럼|만큼|으로|은|는|이|가|을|를|와|과|의|도|만|로)$/;
const QUERY_TERM_EXPANSIONS: Record<string, string[]> = {
  부트캠프: ["캠프", "집중캠프", "코딩캠프"],
  캠프: ["부트캠프", "집중캠프", "코딩캠프"],
};
const QUERY_STOP_WORDS = new Set([
  "관련",
  "나는",
  "내가",
  "대해",
  "무엇",
  "뭘",
  "뭐",
  "어떤",
  "올해",
  "작년",
  "지난",
  "좀",
  "했나",
  "했나요",
  "했어",
  "했을까",
]);

type LexicalSignal = {
  contentPhraseMatches: number;
  contentTermMatches: number;
  matchedTermCount: number;
  metadataPhraseMatches: number;
  metadataTermMatches: number;
};

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

function normalizeLexicalText(value: string | null | undefined) {
  return normalizeKnowledgeText(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQueryTerm(value: string) {
  const withoutSuffix = value.replace(KOREAN_PARTICLE_SUFFIX_PATTERN, "");

  return withoutSuffix.length >= 2 ? withoutSuffix : value;
}

function expandQueryTerms(terms: string[]) {
  const expanded: string[] = [];

  for (const term of terms) {
    expanded.push(term, ...(QUERY_TERM_EXPANSIONS[term] ?? []));
  }

  return [...new Set(expanded)];
}

function extractQueryTerms(query: string) {
  const terms = normalizeLexicalText(query)
    .split(" ")
    .map(normalizeQueryTerm)
    .filter((term) => term.length >= 2 && !QUERY_STOP_WORDS.has(term));

  return expandQueryTerms([...new Set(terms)]);
}

function createQueryPhrases(terms: string[]) {
  const phrases: string[] = [];

  for (let size = Math.min(4, terms.length); size >= 2; size -= 1) {
    for (let index = 0; index <= terms.length - size; index += 1) {
      phrases.push(terms.slice(index, index + size).join(" "));
    }
  }

  return phrases;
}

function getChunkContentText(chunk: string) {
  const bodyMarker = "본문:";
  const bodyIndex = chunk.indexOf(bodyMarker);

  return bodyIndex >= 0 ? chunk.slice(bodyIndex + bodyMarker.length) : chunk;
}

function splitContentSegments(value: string) {
  return normalizeKnowledgeText(value)
    .split(/\n{2,}|(?<=[.!?。！？])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function createLexicalSignal(result: KnowledgeSearchResult, queryTerms: string[]): LexicalSignal {
  const metadataText = normalizeLexicalText(
    [result.source.title, result.source.path].filter(Boolean).join(" "),
  );
  const contentText = normalizeLexicalText(getChunkContentText(result.chunk));
  const matchedTerms = new Set<string>();
  let metadataTermMatches = 0;
  let contentTermMatches = 0;
  let metadataPhraseMatches = 0;
  let contentPhraseMatches = 0;

  for (const term of queryTerms) {
    if (metadataText.includes(term)) {
      metadataTermMatches += 1;
      matchedTerms.add(term);
    }

    if (contentText.includes(term)) {
      contentTermMatches += 1;
      matchedTerms.add(term);
    }
  }

  for (const phrase of createQueryPhrases(queryTerms)) {
    if (metadataText.includes(phrase)) {
      metadataPhraseMatches += phrase.split(" ").length - 1;
    }

    if (contentText.includes(phrase)) {
      contentPhraseMatches += phrase.split(" ").length - 1;
    }
  }

  return {
    contentPhraseMatches,
    contentTermMatches,
    matchedTermCount: matchedTerms.size,
    metadataPhraseMatches,
    metadataTermMatches,
  };
}

function createHybridScore(result: KnowledgeSearchResult, queryTerms: string[]) {
  // 실전 구현 포인트: 벡터 거리가 좋아도 실제 키워드가 전혀 안 맞으면 답변 품질이 흔들립니다.
  // 그래서 vectorScore에 제목/경로/본문의 lexical match boost를 더해 재정렬합니다.
  const vectorScore = createScore(result.distance) ?? 0;
  const signal = createLexicalSignal(result, queryTerms);
  let lexicalBoost = 0;

  lexicalBoost += signal.metadataTermMatches * 0.07;
  lexicalBoost += signal.contentTermMatches * 0.035;
  lexicalBoost += signal.metadataPhraseMatches * 0.1;
  lexicalBoost += signal.contentPhraseMatches * 0.05;

  return Number(Math.min(0.9999, vectorScore + lexicalBoost).toFixed(4));
}

function hasEnoughSearchSignal(result: KnowledgeSearchResult, queryTerms: string[]) {
  if (queryTerms.length <= 2) {
    return true;
  }

  const vectorScore = createScore(result.distance) ?? 0;
  const signal = createLexicalSignal(result, queryTerms);

  if (signal.metadataPhraseMatches + signal.contentPhraseMatches > 0) {
    return true;
  }

  if (signal.matchedTermCount >= 2) {
    return true;
  }

  if (signal.contentTermMatches >= 1 && vectorScore >= 0.45) {
    return true;
  }

  return vectorScore >= 0.55;
}

function dedupeResultsBySource(results: KnowledgeSearchResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = `${result.source.type}:${result.source.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createPublicSource(source: HydratedSource): KnowledgeSearchResult["source"] {
  return {
    id: source.id,
    path: source.path,
    title: source.title,
    type: source.type,
    url: source.url,
  };
}

function scoreContentSegment(segment: string, queryTerms: string[]) {
  const text = normalizeLexicalText(segment);
  let score = 0;

  for (const term of queryTerms) {
    if (text.includes(term)) {
      score += 1;
    }
  }

  for (const phrase of createQueryPhrases(queryTerms)) {
    if (text.includes(phrase)) {
      score += phrase.split(" ").length;
    }
  }

  return score;
}

function createEvidenceChunk({
  fallbackChunk,
  queryTerms,
  source,
}: {
  fallbackChunk: string;
  queryTerms: string[];
  source: HydratedSource;
}) {
  const content = source.contentText?.trim();

  if (!content) {
    return fallbackChunk;
  }

  const segments = splitContentSegments(content);

  if (!segments.length) {
    return fallbackChunk;
  }

  const ranked = segments
    .map((segment, index) => ({
      index,
      score: scoreContentSegment(segment, queryTerms),
      segment,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const best = ranked[0];

  if (!best || best.score <= 0) {
    return segments.slice(0, 2).join("\n\n").slice(0, 1200);
  }

  const start = Math.max(0, best.index - 1);
  const end = Math.min(segments.length, best.index + 2);

  return segments.slice(start, end).join("\n\n").slice(0, 1200);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readSourceType(match: VectorQueryMatch): KnowledgeSourceType | null {
  const sourceType = readString(match.metadata.sourceType);

  if (sourceType === "DROPBOX_MD" || match.id.startsWith("dropbox-md:")) {
    return "DROPBOX_MD";
  }

  if (sourceType === "NOTION_PAGE" || match.id.startsWith("notion-page:")) {
    return "NOTION_PAGE";
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
  // ChromaDB에는 chunk와 metadata만 있으므로, 사용자에게 보여줄 제목/URL/원문 근거는 DB에서 다시 가져옵니다.
  // 이 hydration 단계에서 ownerId를 조건으로 걸어 다른 사용자의 외부지식이 섞이지 않게 합니다.
  const postIds = new Set<string>();
  const dropboxIds = new Set<string>();
  const notionPageIds = new Set<string>();

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
    } else if (sourceType === "DROPBOX_MD") {
      dropboxIds.add(sourceId);
    } else {
      notionPageIds.add(sourceId);
    }
  }

  const [posts, dropboxDocuments, notionPages] = await Promise.all([
    postIds.size
      ? prisma.post.findMany({
          where: {
            authorId: ownerId,
            id: {
              in: [...postIds],
            },
          },
          select: {
            content: true,
            excerpt: true,
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
            plainText: true,
          },
        })
      : Promise.resolve([]),
    notionPageIds.size
      ? prisma.notionPageDocument.findMany({
          where: {
            id: {
              in: [...notionPageIds],
            },
            ownerId,
          },
          select: {
            id: true,
            plainText: true,
            title: true,
            url: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const hydrated = new Map<string, HydratedSource>();

  for (const post of posts) {
    hydrated.set(`POST:${post.id}`, {
      contentText: buildPostIndexText({
        content: post.content,
        excerpt: post.excerpt,
        title: post.title,
      }),
      id: post.id,
      path: null,
      title: post.title,
      type: "POST",
      url: `/${username}/posts/${post.id}`,
    });
  }

  for (const document of dropboxDocuments) {
    hydrated.set(`DROPBOX_MD:${document.id}`, {
      contentText: document.plainText,
      id: document.id,
      path: document.pathDisplay,
      title: document.name,
      type: "DROPBOX_MD",
      url: null,
    });
  }

  for (const page of notionPages) {
    hydrated.set(`NOTION_PAGE:${page.id}`, {
      contentText: page.plainText,
      id: page.id,
      path: null,
      title: page.title,
      type: "NOTION_PAGE",
      url: page.url,
    });
  }

  return hydrated;
}

function toSearchResult(
  match: VectorQueryMatch,
  source: HydratedSource,
  queryTerms: string[] = [],
): KnowledgeSearchResult {
  const result = {
    chunk: createEvidenceChunk({
      fallbackChunk: getChunkContentText(match.document),
      queryTerms,
      source,
    }),
    chunkId: match.id,
    distance: match.distance,
    score: createScore(match.distance),
    source: createPublicSource(source),
  };

  return {
    ...result,
    score: queryTerms.length ? createHybridScore(result, queryTerms) : result.score,
  };
}

function createContext(results: KnowledgeSearchResult[]) {
  let context = "";

  for (const [index, result] of results.entries()) {
    const label =
      result.source.type === "POST"
        ? `게시글: ${result.source.title} (${result.source.url})`
        : result.source.type === "DROPBOX_MD"
          ? `Dropbox: ${result.source.title} (${result.source.path})`
          : `Notion: ${result.source.title} (${result.source.url ?? "url 없음"})`;
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
  const candidateLimit = Math.min(MAX_CANDIDATE_LIMIT, Math.max(safeLimit, safeLimit * 8));
  const queryTerms = extractQueryTerms(normalizedQuery);
  // 1. 질문 자체를 embedding으로 바꿉니다.
  const embedding = await embeddingClient.embedDocuments([normalizedQuery]);
  // 2. 같은 Chroma collection에서 게시글(authorId)과 외부지식(ownerId)을 각각 검색합니다.
  const [postMatches, dropboxMatches] = await Promise.all([
    vectorStore.query({
      embedding: embedding.embeddings[0],
      limit: candidateLimit,
      where: {
        authorId: ownerId,
      },
    }),
    vectorStore.query({
      embedding: embedding.embeddings[0],
      limit: candidateLimit,
      where: {
        ownerId,
      },
    }),
  ]);
  const matches = sortMatches([...postMatches, ...dropboxMatches]);
  // 3. Chroma match를 DB row와 다시 연결해 제목/경로/본문 근거를 복원합니다.
  const hydrated = await hydrateSources({
    matches,
    ownerId,
    prisma,
    username,
  });

  const results = matches
    .map((match) => {
      const sourceType = readSourceType(match);
      const sourceId = sourceType ? readSourceId(match, sourceType) : null;
      const source = sourceType && sourceId ? hydrated.get(`${sourceType}:${sourceId}`) : null;

      return source ? toSearchResult(match, source, queryTerms) : null;
    })
    .filter((result): result is KnowledgeSearchResult => Boolean(result))
    .filter((result) => hasEnoughSearchSignal(result, queryTerms))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return dedupeResultsBySource(results).slice(0, safeLimit);
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
    // 답변 생성 전 반드시 검색 근거를 먼저 만듭니다.
    // 근거가 없으면 LLM을 호출하지 않고 "찾지 못했다"는 응답을 반환합니다.
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

    // 4. 검색된 근거 chunk들을 context로 묶고, generation client가 최종 답변을 만듭니다.
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
