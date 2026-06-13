import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth";
import {
  getWritingStyleProfile,
  refreshWritingStyleProfile,
  toWritingAgentErrorResponse,
} from "@/backend/writing-agent";

export const runtime = "nodejs";

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

export async function POST() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  try {
    const profile = await refreshWritingStyleProfile(user.id);

    return jsonWithRefreshedSession({ profile }, auth);
  } catch (error) {
    const response = toWritingAgentErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
