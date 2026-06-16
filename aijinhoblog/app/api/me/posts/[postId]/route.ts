import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { fail, json, readJson } from "@/backend/core/http";
import { deleteOwnerPost, PostServiceError, updateOwnerPost } from "@/backend/posts/service";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";
import { parsePostPayload } from "@/backend/core/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    postId: string;
  }>;
};

// PATCH /api/me/posts/:postId
// 글 수정 API입니다. 로그인 유저만 접근하고, 실제 소유자 검증은 updateOwnerPost에서 다시 수행합니다.
export async function PATCH(request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { postId } = await params;
  const payload = await readJson(request);
  const parsed = parsePostPayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  try {
    // 수정도 요약 재생성과 벡터 재인덱싱을 유발하므로 rate limit 대상입니다.
    await enforceAiRateLimit({
      endpoint: "post.update",
      userId: user.id,
    });
    const result = await updateOwnerPost(user.id, postId, parsed.value);
    const response = json(result);

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    if (error instanceof PostServiceError) {
      return failWithRefreshedSession(error.message, auth, error.status);
    }

    return failWithRefreshedSession("게시글 수정에 실패했습니다.", auth, 500);
  }
}

// DELETE /api/me/posts/:postId
// 글 삭제 API입니다. service 계층에서 ChromaDB 벡터를 먼저 삭제한 뒤 DB 게시글을 삭제합니다.
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { postId } = await params;
  try {
    await enforceAiRateLimit({
      endpoint: "post.delete",
      userId: user.id,
    });
    const result = await deleteOwnerPost(user.id, postId);
    const response = json(result);

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    if (error instanceof PostServiceError) {
      return failWithRefreshedSession(error.message, auth, error.status);
    }

    return failWithRefreshedSession("게시글 삭제에 실패했습니다.", auth, 500);
  }
}
