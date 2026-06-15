import { NextResponse } from "next/server";

import { attachRefreshedSessionCookie, getCurrentUserOrRefresh } from "@/backend/auth/session";
import {
  DropboxOAuthConfigError,
  DropboxOAuthError,
  exchangeDropboxOAuthCode,
  readDropboxOAuthState,
  verifyDropboxOAuthState,
} from "@/backend/integrations/dropbox/oauth";
import { upsertDropboxConnectionFromOAuth } from "@/backend/integrations/external-connections";
import { fail } from "@/backend/core/http";

export const runtime = "nodejs";

function createSettingsRedirect(
  username: string,
  requestUrl: string,
  params: Record<string, string>,
) {
  const url = new URL(`/${username}/settings/connections`, new URL(requestUrl).origin);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function normalizeReturnTo(value: string | null, username: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return `/${username}/settings/connections`;
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
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError =
    requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");

  const statePayload = state ? readDropboxOAuthState(state, user.id) : null;
  const returnTo = normalizeReturnTo(statePayload?.returnTo ?? null, user.username);

  if (oauthError) {
    const response = NextResponse.redirect(
      createAppRedirect(request.url, returnTo, {
        error: oauthError,
      }),
    );

    return attachRefreshedSessionCookie(response, auth);
  }

  if (!code || !state || !verifyDropboxOAuthState(state, user.id)) {
    const response = NextResponse.redirect(
      createSettingsRedirect(user.username, request.url, {
        error: "Dropbox 연결 검증에 실패했습니다.",
      }),
    );

    return attachRefreshedSessionCookie(response, auth);
  }

  try {
    const tokens = await exchangeDropboxOAuthCode({
      code,
      origin: requestUrl.origin,
    });

    await upsertDropboxConnectionFromOAuth(user.id, tokens);

    const response = NextResponse.redirect(
      createAppRedirect(request.url, returnTo, {
        connected: "dropbox",
      }),
    );

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    const message =
      error instanceof DropboxOAuthConfigError || error instanceof DropboxOAuthError
        ? error.message
        : "Dropbox 연결을 저장하지 못했습니다.";
    const response = NextResponse.redirect(
      createAppRedirect(request.url, returnTo, {
        error: message,
      }),
    );

    return attachRefreshedSessionCookie(response, auth);
  }
}
