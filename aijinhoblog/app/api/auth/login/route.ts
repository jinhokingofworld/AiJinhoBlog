import { attachSessionCookie, createUserSession } from "@/backend/auth/session";
import { verifyPassword } from "@/backend/auth/crypto";
import { ensureDefaultBlogContent } from "@/backend/posts/folders";
import { fail, json, readJson } from "@/backend/core/http";
import { prisma } from "@/backend/core/prisma";
import { parseCredentials } from "@/backend/core/validation";

export const runtime = "nodejs";

// POST /api/auth/login
// 로그인 페이지가 호출하는 API입니다. 비밀번호 검증 후 access/refresh JWT를 만들고 httpOnly cookie로 내려줍니다.
export async function POST(request: Request) {
  const payload = await readJson(request);
  const parsed = parseCredentials(payload, { requireName: false });

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  const user = await prisma.user.findUnique({
    where: {
      email: parsed.value.email,
    },
  });

  if (!user || !verifyPassword(parsed.value.password, user.passwordHash)) {
    return fail("이메일 또는 비밀번호가 올바르지 않습니다.", 401);
  }

  await ensureDefaultBlogContent(user.id);

  // createUserSession 내부에서 access JWT, refresh JWT, DB Session row가 함께 만들어집니다.
  const session = await createUserSession(user.id);
  const response = json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
    },
  });

  // 응답 body에는 사용자 기본 정보만 담고, 실제 인증 토큰은 Set-Cookie 헤더로 전달합니다.
  attachSessionCookie(response, session);

  return response;
}
