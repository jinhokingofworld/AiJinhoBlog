import {
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
  jsonWithRefreshedSession,
} from "@/backend/auth";
import { readJson } from "@/backend/http";
import { rewriteInUserStyle, toWritingAgentErrorResponse } from "@/backend/writing-agent";

export const runtime = "nodejs";

type RewritePayload = {
  text?: unknown;
};

function parseRewritePayload(payload: unknown) {
  const value = (payload ?? {}) as RewritePayload;

  return {
    text: typeof value.text === "string" ? value.text.trim() : "",
  };
}

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return failWithRefreshedSession("로그인이 필요합니다.", auth, 401);
  }

  const payload = parseRewritePayload(await readJson(request));

  if (!payload.text) {
    return failWithRefreshedSession("재작성할 원문이 필요합니다.", auth, 400);
  }

  try {
    const result = await rewriteInUserStyle({
      ownerId: user.id,
      text: payload.text,
    });

    return jsonWithRefreshedSession({ result }, auth);
  } catch (error) {
    const response = toWritingAgentErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
