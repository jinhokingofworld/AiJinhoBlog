import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth";
import { EmbeddingProviderError, EmbeddingSkippedError } from "@/backend/ai-embedding";
import { ChromaVectorStoreError } from "@/backend/ai-vector-store";
import { readJson } from "@/backend/http";
import { findDuplicateCandidates } from "@/backend/rag";

export const runtime = "nodejs";

type DuplicatePayload = {
  content?: unknown;
  excerpt?: unknown;
  limit?: unknown;
  title?: unknown;
};

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
    const response = toDuplicateErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
