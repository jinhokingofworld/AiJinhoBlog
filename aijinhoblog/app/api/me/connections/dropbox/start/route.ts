import { NextResponse } from "next/server";

import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import {
  DropboxOAuthConfigError,
  createDropboxOAuthAuthorizeUrl,
  createDropboxOAuthState,
} from "@/backend/integrations/dropbox/oauth";
import { fail } from "@/backend/core/http";

export const runtime = "nodejs";

// GET /api/me/connections/dropbox/start
// Dropbox OAuth 시작 route입니다. 로그인 사용자를 확인하고 Dropbox authorize URL로 redirect합니다.
function normalizeReturnTo(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return fallback;
  }

  return value;
}

function createAppRedirect(requestUrl: string, returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, new URL(requestUrl).origin);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function GET(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const requestUrl = new URL(request.url);
  const returnTo = normalizeReturnTo(
    requestUrl.searchParams.get("returnTo"),
    `/${user.username}/settings/connections`,
  );

  try {
    // state에는 ownerId와 returnTo가 들어갑니다.
    // callback에서 같은 로그인 사용자와 매칭되는지 검증해 OAuth CSRF를 줄입니다.
    const redirectUrl = createDropboxOAuthAuthorizeUrl({
      origin: requestUrl.origin,
      state: createDropboxOAuthState(user.id, {
        returnTo,
      }),
    });
    const response = NextResponse.redirect(redirectUrl);

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    if (error instanceof DropboxOAuthConfigError) {
      const response = NextResponse.redirect(
        createAppRedirect(request.url, returnTo, {
          error: error.message,
        }),
      );

      return attachRefreshedSessionCookie(response, auth);
    }

    return failWithRefreshedSession("Dropbox 연결을 시작하지 못했습니다.", auth, 502);
  }
}
