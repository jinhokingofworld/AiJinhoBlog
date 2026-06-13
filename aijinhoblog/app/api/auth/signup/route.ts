import { hashPassword } from "@/backend/auth-crypto";
import { fail, json, readJson } from "@/backend/http";
import { prisma } from "@/backend/prisma";
import { parseCredentials } from "@/backend/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await readJson(request);
  const parsed = parseCredentials(payload, { requireName: true, requireUsername: true });

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: parsed.value.email }, { username: parsed.value.username }],
    },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  if (existingUser?.email === parsed.value.email) {
    return fail("이미 가입된 이메일입니다.", 409);
  }

  if (existingUser?.username === parsed.value.username) {
    return fail("이미 사용 중인 username입니다.", 409);
  }

  const user = await prisma.user.create({
    data: {
      email: parsed.value.email,
      username: parsed.value.username ?? parsed.value.email.split("@")[0],
      name: parsed.value.name ?? parsed.value.email.split("@")[0],
      passwordHash: hashPassword(parsed.value.password),
    },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
    },
  });

  return json({ user }, 201);
}
