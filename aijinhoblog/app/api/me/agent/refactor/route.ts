import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth/session";
import { readJson } from "@/backend/core/http";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";
import { refactorForPublication, toWritingAgentErrorResponse } from "@/backend/ai/writing-agent";

export const runtime = "nodejs";

type RefactorPayload = {
  mode?: unknown;
  postId?: unknown;
  text?: unknown;
};

type RefactorMode = "expression" | "sentence" | "structure";

function parseMode(value: unknown): RefactorMode {
  return value === "expression" || value === "sentence" || value === "structure"
    ? value
    : "sentence";
}

function parseRefactorPayload(payload: unknown) {
  const value = (payload ?? {}) as RefactorPayload;

  return {
    mode: parseMode(value.mode),
    postId: typeof value.postId === "string" ? value.postId.trim() : "",
    text: typeof value.text === "string" ? value.text.trim() : "",
  };
}

// POST /api/me/agent/refactor
// 게시글 또는 입력 text를 출판용으로 다듬고, 결과를 WritingRefactorResult에 저장합니다.
export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  const payload = parseRefactorPayload(await readJson(request));

  if (!payload.postId && !payload.text) {
    return failWithRefreshedSession("게시글 또는 원문이 필요합니다.", auth, 400);
  }

  try {
    await enforceAiRateLimit({
      endpoint: "agent.refactor",
      userId: user.id,
    });
    const result = await refactorForPublication({
      mode: payload.mode,
      ownerId: user.id,
      postId: payload.postId,
      text: payload.text,
    });

    return jsonWithRefreshedSession({ result }, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    const response = toWritingAgentErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
