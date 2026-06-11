import { attachSessionCookie, createUserSession } from "@/lib/auth";
import { hashPassword } from "@/lib/auth-crypto";
import { fail, json, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { parseCredentials } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await readJson(request);
  const parsed = parseCredentials(payload, { requireName: true });

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email: parsed.value.email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return fail("이미 가입된 이메일입니다.", 409);
  }

  const user = await prisma.user.create({
    data: {
      email: parsed.value.email,
      name: parsed.value.name ?? parsed.value.email.split("@")[0],
      passwordHash: hashPassword(parsed.value.password),
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
  const session = await createUserSession(user.id);
  const response = json({ user }, 201);

  attachSessionCookie(response, session.token, session.expiresAt);

  return response;
}
