import { attachSessionCookie, createUserSession } from "@/backend/auth";
import { verifyPassword } from "@/backend/auth-crypto";
import { ensureDefaultBlogContent } from "@/backend/folders";
import { fail, json, readJson } from "@/backend/http";
import { prisma } from "@/backend/prisma";
import { parseCredentials } from "@/backend/validation";

export const runtime = "nodejs";

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

  const session = await createUserSession(user.id);
  const response = json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
    },
  });

  attachSessionCookie(response, session);

  return response;
}
