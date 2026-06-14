import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import { fail, json, readJson } from "@/backend/http";
import { createOwnerPost, PostServiceError } from "@/backend/posts";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/rate-limit";
import { parsePostPayload } from "@/backend/validation";

export const runtime = "nodejs";

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
