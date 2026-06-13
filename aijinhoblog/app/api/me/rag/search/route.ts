import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth";
import { EmbeddingProviderError, EmbeddingSkippedError } from "@/backend/ai-embedding";
import { ChromaVectorStoreError } from "@/backend/ai-vector-store";
import { readJson } from "@/backend/http";
import { searchKnowledgeSources } from "@/backend/rag";

export const runtime = "nodejs";

type SearchPayload = {
  limit?: unknown;
  query?: unknown;
};

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
    const sources = await searchKnowledgeSources({
      limit: payload.limit,
      ownerId: user.id,
      query: payload.query,
      username: user.username,
    });

    return jsonWithRefreshedSession({ sources }, auth);
  } catch (error) {
    const response = toRagErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
