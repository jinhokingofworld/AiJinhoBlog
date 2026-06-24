import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth/session";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";
import {
  getWritingStyleProfile,
  refreshWritingStyleProfile,
  toWritingAgentErrorResponse,
} from "@/backend/ai/writing-agent";

export const runtime = "nodejs";

// GET /api/me/agent/style-profile
// 저장된 문체 프로파일을 조회합니다. 없으면 null을 반환하고 생성은 POST가 담당합니다.
export async function GET() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  try {
    const profile = await getWritingStyleProfile(user.id);

    return jsonWithRefreshedSession({ profile }, auth);
  } catch (error) {
    const response = toWritingAgentErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}

// POST /api/me/agent/style-profile
// 최근 글을 다시 분석해 문체 프로파일을 생성/갱신합니다.
export async function POST() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  try {
    await enforceAiRateLimit({
      endpoint: "agent.style-profile",
      userId: user.id,
    });
    const profile = await refreshWritingStyleProfile(user.id);

    return jsonWithRefreshedSession({ profile }, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    const response = toWritingAgentErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
