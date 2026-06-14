import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth";
import { applyRefactorResult, toWritingAgentErrorResponse } from "@/backend/writing-agent";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    resultId: string;
  }>;
};

export async function POST(_request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  const { resultId } = await params;

  try {
    const result = await applyRefactorResult({
      ownerId: user.id,
      resultId,
    });

    return jsonWithRefreshedSession(result, auth);
  } catch (error) {
    const response = toWritingAgentErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
