import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createJwt, createSessionToken, hashSessionToken, verifyJwt } from "@/backend/auth-crypto";
import { prisma } from "@/backend/prisma";

export const ACCESS_TOKEN_COOKIE = "aij_access";
export const REFRESH_TOKEN_COOKIE = "aij_refresh";

const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 15;
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const userSelect = {
  id: true,
  email: true,
  username: true,
  name: true,
} as const;

function createExpiresAt(ttlMs: number) {
  return new Date(Date.now() + ttlMs);
}

export async function createUserSession(userId: string) {
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

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = readUserIdFromAccessToken(cookieStore.get(ACCESS_TOKEN_COOKIE)?.value);

  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: userSelect,
  });
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
