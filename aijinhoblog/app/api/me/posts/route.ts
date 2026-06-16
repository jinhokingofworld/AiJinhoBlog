import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { fail, json, readJson } from "@/backend/core/http";
import { createOwnerPost, PostServiceError } from "@/backend/posts/service";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";
import { parsePostPayload } from "@/backend/core/validation";

export const runtime = "nodejs";

// POST /api/me/posts
// PostForm의 새 글 저장 요청이 들어오는 API route입니다.
// 흐름: 세션 확인/refresh -> payload 검증 -> AI rate limit -> createOwnerPost -> refreshed cookie 포함 응답.
export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parsePostPayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  try {
    // 게시글 저장은 AI 요약/벡터 인덱싱까지 이어질 수 있으므로 AI rate limit 버킷을 공유합니다.
    await enforceAiRateLimit({
      endpoint: "post.create",
      userId: user.id,
    });
    const result = await createOwnerPost(user.id, parsed.value);
    const response = json(result, 201);

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    if (error instanceof PostServiceError) {
      return failWithRefreshedSession(error.message, auth, error.status);
    }

    return failWithRefreshedSession("게시글 저장에 실패했습니다.", auth, 500);
  }
}
