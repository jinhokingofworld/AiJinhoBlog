import { attachSessionCookie, getCurrentUser, refreshUserSession } from "@/backend/auth/session";
import { json } from "@/backend/core/http";

export const runtime = "nodejs";

// GET /api/auth/me
// 로그인 페이지가 "이미 로그인된 사용자라면 폼을 건너뛰기" 위해 호출합니다.
// access token이 만료됐으면 refresh token으로 새 세션 쿠키를 발급할 수 있습니다.
export async function GET() {
  const user = await getCurrentUser({ allowRefreshToken: false });

  if (user) {
    return json({ user });
  }

  const refreshed = await refreshUserSession();
  const response = json({ user: refreshed?.user ?? null });

  if (refreshed) {
    attachSessionCookie(response, refreshed.tokens);
  }

  return response;
}
