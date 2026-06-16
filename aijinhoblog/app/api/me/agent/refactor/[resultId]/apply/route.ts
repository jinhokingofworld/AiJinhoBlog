import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth/session";
import { applyRefactorResult, toWritingAgentErrorResponse } from "@/backend/ai/writing-agent";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    resultId: string;
  }>;
};

// POST /api/me/agent/refactor/:resultId/apply
// 저장된 리팩토링 결과를 실제 게시글 본문에 반영하고 벡터 인덱스를 다시 동기화합니다.
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
