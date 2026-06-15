import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth/session";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";
import { getWritingInsights, toWritingAgentErrorResponse } from "@/backend/ai/writing-agent";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  try {
    await enforceAiRateLimit({
      endpoint: "agent.insights",
      userId: user.id,
    });
    const insights = await getWritingInsights(user.id);

    return jsonWithRefreshedSession({ insights }, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    const response = toWritingAgentErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
