import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth/session";
import { EmbeddingProviderError, EmbeddingSkippedError } from "@/backend/ai/embedding";
import { ChromaVectorStoreError } from "@/backend/ai/vector-store";
import { readJson } from "@/backend/core/http";
import { searchKnowledgeSources } from "@/backend/ai/rag";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";

export const runtime = "nodejs";

type SearchPayload = {
  limit?: unknown;
  query?: unknown;
};

// POST /api/me/rag/search
// 질문을 embedding으로 바꿔 ChromaDB에서 관련 게시글/외부지식 chunk를 찾는 검색 전용 API입니다.
function parseSearchPayload(payload: unknown) {
  const value = (payload ?? {}) as SearchPayload;

  return {
    limit: typeof value.limit === "number" ? value.limit : undefined,
    query: typeof value.query === "string" ? value.query.trim() : "",
  };
}

function toRagErrorResponse(error: unknown) {
  if (error instanceof EmbeddingSkippedError) {
    return {
      message: error.message,
      status: 503,
    };
  }

  if (error instanceof EmbeddingProviderError || error instanceof ChromaVectorStoreError) {
    return {
      message: error.message,
      status: error.status && error.status >= 400 && error.status < 500 ? 400 : 502,
    };
  }

  return {
    message: "RAG 검색에 실패했습니다.",
    status: 502,
  };
}

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  const payload = parseSearchPayload(await readJson(request));

  if (!payload.query) {
    return failWithRefreshedSession("검색할 질문이 필요합니다.", auth, 400);
  }

  try {
    // RAG 검색은 OpenAI embedding + Chroma query를 사용하므로 rate limit 대상입니다.
    await enforceAiRateLimit({
      endpoint: "rag.search",
      userId: user.id,
    });
    const sources = await searchKnowledgeSources({
      limit: payload.limit,
      ownerId: user.id,
      query: payload.query,
      username: user.username,
    });

    return jsonWithRefreshedSession({ sources }, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    const response = toRagErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
