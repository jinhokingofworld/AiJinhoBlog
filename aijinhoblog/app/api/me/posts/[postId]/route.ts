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
