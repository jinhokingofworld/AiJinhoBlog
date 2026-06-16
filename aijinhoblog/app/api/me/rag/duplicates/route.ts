import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth/session";
import { EmbeddingProviderError, EmbeddingSkippedError } from "@/backend/ai/embedding";
import { ChromaVectorStoreError } from "@/backend/ai/vector-store";
import { readJson } from "@/backend/core/http";
import { findDuplicateCandidates } from "@/backend/ai/rag";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";

export const runtime = "nodejs";

type DuplicatePayload = {
  content?: unknown;
  excerpt?: unknown;
  limit?: unknown;
  title?: unknown;
};

// POST /api/me/rag/duplicates
// 글쓰기 폼의 "유사 자료 확인"에서 호출됩니다.
// 작성 중인 글을 RAG 검색 쿼리로 만들어 기존 게시글/Dropbox/Notion 자료와 겹치는지 확인합니다.
function parseDuplicatePayload(payload: unknown) {
  const value = (payload ?? {}) as DuplicatePayload;

  return {
    content: typeof value.content === "string" ? value.content.trim() : "",
    excerpt: typeof value.excerpt === "string" ? value.excerpt.trim() : "",
    limit: typeof value.limit === "number" ? value.limit : undefined,
    title: typeof value.title === "string" ? value.title.trim() : "",
  };
}

function toDuplicateErrorResponse(error: unknown) {
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
    message: "유사 자료 확인에 실패했습니다.",
    status: 502,
  };
}

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  const payload = parseDuplicatePayload(await readJson(request));

  if (!payload.title && !payload.content) {
    return failWithRefreshedSession("제목 또는 본문이 필요합니다.", auth, 400);
  }

  try {
    await enforceAiRateLimit({
      endpoint: "rag.duplicates",
      userId: user.id,
    });
    const candidates = await findDuplicateCandidates({
      content: payload.content,
      excerpt: payload.excerpt,
      limit: payload.limit,
      ownerId: user.id,
      title: payload.title,
      username: user.username,
    });

    return jsonWithRefreshedSession({ candidates }, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    const response = toDuplicateErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
