import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth/session";
import { EmbeddingProviderError, EmbeddingSkippedError } from "@/backend/ai/embedding";
import { GenerationProviderError, GenerationSkippedError } from "@/backend/ai/generation";
import { ChromaVectorStoreError } from "@/backend/ai/vector-store";
import { readJson } from "@/backend/core/http";
import { answerMemoryQuestion } from "@/backend/ai/rag";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";

export const runtime = "nodejs";

type AnswerPayload = {
  limit?: unknown;
  question?: unknown;
};

// POST /api/me/rag/answer
// 질문 -> 벡터 검색 -> 근거 context 구성 -> OpenAI 답변 생성까지 수행하는 RAG 답변 API입니다.
function parseAnswerPayload(payload: unknown) {
  const value = (payload ?? {}) as AnswerPayload;

  return {
    limit: typeof value.limit === "number" ? value.limit : undefined,
    question: typeof value.question === "string" ? value.question.trim() : "",
  };
}

function toRagAnswerErrorResponse(error: unknown) {
  if (error instanceof EmbeddingSkippedError || error instanceof GenerationSkippedError) {
    return {
      message: error.message,
      status: 503,
    };
  }

  if (
    error instanceof EmbeddingProviderError ||
    error instanceof GenerationProviderError ||
    error instanceof ChromaVectorStoreError
  ) {
    return {
      message: error.message,
      status: error.status && error.status >= 400 && error.status < 500 ? 400 : 502,
    };
  }

  return {
    message: "RAG 답변 생성에 실패했습니다.",
    status: 502,
  };
}

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  const payload = parseAnswerPayload(await readJson(request));

  if (!payload.question) {
    return failWithRefreshedSession("질문이 필요합니다.", auth, 400);
  }

  try {
    // 답변 생성은 embedding, Chroma query, LLM generation이 모두 포함되어 가장 무거운 RAG 경로입니다.
    await enforceAiRateLimit({
      endpoint: "rag.answer",
      userId: user.id,
    });
    const result = await answerMemoryQuestion({
      limit: payload.limit,
      ownerId: user.id,
      question: payload.question,
      username: user.username,
    });

    return jsonWithRefreshedSession({ result }, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    const response = toRagAnswerErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
