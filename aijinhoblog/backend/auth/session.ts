import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createJwt, createSessionToken, hashSessionToken, verifyJwt } from "@/backend/auth/crypto";
import { fail, json } from "@/backend/core/http";
import { prisma } from "@/backend/core/prisma";

export const ACCESS_TOKEN_COOKIE = "aij_access";
export const REFRESH_TOKEN_COOKIE = "aij_refresh";

// 인증 구조 요약:
// - access token: 짧게 살아있는 JWT, 대부분의 요청에서 현재 userId를 빠르게 확인합니다.
// - refresh token: 더 길게 살아있는 JWT, hash를 DB Session 테이블에 저장해 로그아웃/폐기를 제어합니다.
// - 둘 다 httpOnly cookie에 담기 때문에 브라우저 JS는 토큰 값을 직접 읽지 못합니다.
const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 15;
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const userSelect = {
  id: true,
  email: true,
  username: true,
  name: true,
} as const;

type SessionTokens = Awaited<ReturnType<typeof createUserSession>>;

function createExpiresAt(ttlMs: number) {
  return new Date(Date.now() + ttlMs);
}

export async function createUserSession(userId: string) {
  // 실전 구현 포인트: refreshTokenId는 JWT의 jti에 들어가지만 DB에는 원문 토큰을 저장하지 않습니다.
  // 아래에서 refresh JWT 전체를 hashSessionToken으로 해시해 저장하므로 DB 유출 시 원문 토큰 재사용을 줄입니다.
  const refreshTokenId = createSessionToken();
  const accessExpiresAt = createExpiresAt(ACCESS_TOKEN_TTL_MS);
  const refreshExpiresAt = createExpiresAt(REFRESH_TOKEN_TTL_MS);
  const accessToken = createJwt(
    {
      sub: userId,
      type: "access",
    },
    accessExpiresAt,
  );
  const refreshToken = createJwt(
    {
      sub: userId,
      jti: refreshTokenId,
      type: "refresh",
    },
    refreshExpiresAt,
  );

  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(refreshToken),
      userId,
      expiresAt: refreshExpiresAt,
    },
  });

  return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt };
}

export function attachSessionCookie(
  response: NextResponse,
  tokens: Awaited<ReturnType<typeof createUserSession>>,
) {
  // 로그인 API 응답에 쿠키를 붙이는 지점입니다.
  // 이후 브라우저는 같은 도메인 요청마다 이 쿠키를 자동으로 전송합니다.
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: tokens.accessExpiresAt,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: tokens.refreshExpiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
}

function readUserIdFromAccessToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const payload = verifyJwt(token);

  if (payload?.type !== "access" || typeof payload.sub !== "string") {
    return null;
  }

  return payload.sub;
}

async function readUserFromRefreshToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const payload = verifyJwt(token);

  if (payload?.type !== "refresh" || typeof payload.sub !== "string") {
    return null;
  }

  // refresh token은 JWT 서명만 맞아도 통과시키지 않고 DB Session까지 확인합니다.
  // 이 덕분에 로그아웃 시 Session row를 삭제해서 장기 토큰을 서버 측에서 무효화할 수 있습니다.
  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    include: {
      user: {
        select: userSelect,
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }

  return session.user;
}

export async function getCurrentUser(options: { allowRefreshToken?: boolean } = {}) {
  const allowRefreshToken = options.allowRefreshToken ?? true;
  const cookieStore = await cookies();
  // 일반 요청에서는 먼저 access cookie를 읽어 JWT만 검증합니다.
  // access token이 살아 있으면 refresh DB 조회 없이 바로 userId를 얻을 수 있습니다.
  const userId = readUserIdFromAccessToken(cookieStore.get(ACCESS_TOKEN_COOKIE)?.value);

  if (userId) {
    return prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: userSelect,
    });
  }

  if (!allowRefreshToken) {
    return null;
  }

  // access token이 없거나 만료됐을 때만 refresh cookie + DB Session 확인으로 넘어갑니다.
  return readUserFromRefreshToken(cookieStore.get(REFRESH_TOKEN_COOKIE)?.value);
}

export async function getCurrentUserOrRefresh() {
  const user = await getCurrentUser({ allowRefreshToken: false });

  if (user) {
    return {
      user,
      tokens: null,
    };
  }

  const refreshed = await refreshUserSession();

  return {
    user: refreshed?.user ?? null,
    tokens: refreshed?.tokens ?? null,
  };
}

export function attachRefreshedSessionCookie(
  response: NextResponse,
  auth: { tokens: SessionTokens | null },
) {
  if (auth.tokens) {
    attachSessionCookie(response, auth.tokens);
  }

  return response;
}

export function jsonWithRefreshedSession<T>(
  data: T,
  auth: { tokens: SessionTokens | null },
  status = 200,
) {
  return attachRefreshedSessionCookie(json(data, status), auth);
}

export function failWithRefreshedSession(
  message: string,
  auth: { tokens: SessionTokens | null },
  status = 400,
) {
  return attachRefreshedSessionCookie(fail(message, status), auth);
}

export async function refreshUserSession() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return null;
  }

  const payload = verifyJwt(refreshToken);

  if (payload?.type !== "refresh" || typeof payload.sub !== "string") {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(refreshToken),
    },
    include: {
      user: {
        select: userSelect,
      },
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
    return null;
  }

  // 실전 구현 포인트: refresh token rotation.
  // 기존 refresh Session을 삭제하고 새 access/refresh 쌍을 발급해 장기 토큰 재사용 위험을 줄입니다.
  await prisma.session.delete({ where: { id: session.id } }).catch(() => null);
  const tokens = await createUserSession(session.userId);

  return {
    user: session.user,
    tokens,
  };
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!token) {
    return;
  }

  await prisma.session
    .delete({
      where: {
        tokenHash: hashSessionToken(token),
      },
    })
    .catch(() => null);
}
