import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth";
import { EmbeddingProviderError, EmbeddingSkippedError } from "@/backend/ai-embedding";
import { GenerationProviderError, GenerationSkippedError } from "@/backend/ai-generation";
import { ChromaVectorStoreError } from "@/backend/ai-vector-store";
import { readJson } from "@/backend/http";
import { answerMemoryQuestion } from "@/backend/rag";

export const runtime = "nodejs";

type AnswerPayload = {
  limit?: unknown;
  question?: unknown;
};

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
    const result = await answerMemoryQuestion({
      limit: payload.limit,
      ownerId: user.id,
      question: payload.question,
      username: user.username,
    });

    return jsonWithRefreshedSession({ result }, auth);
  } catch (error) {
    const response = toRagAnswerErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
