import { NextResponse } from "next/server";

import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import {
  DropboxOAuthConfigError,
  createDropboxOAuthAuthorizeUrl,
  createDropboxOAuthState,
} from "@/backend/dropbox-oauth";
import { fail } from "@/backend/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  try {
    const redirectUrl = createDropboxOAuthAuthorizeUrl({
      origin: new URL(request.url).origin,
      state: createDropboxOAuthState(user.id),
    });
    const response = NextResponse.redirect(redirectUrl);

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    if (error instanceof DropboxOAuthConfigError) {
      return failWithRefreshedSession(error.message, auth, 500);
    }

    return failWithRefreshedSession("Dropbox 연결을 시작하지 못했습니다.", auth, 502);
  }
}
