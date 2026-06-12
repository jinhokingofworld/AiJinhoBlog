import { getCurrentUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { profileSelect, serializeProfile } from "@/lib/profile";
import { prisma } from "@/lib/prisma";
import { parseProfilePayload } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parseProfilePayload(payload);

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  const updated = await prisma.user.update({
    where: {
      id: user.id,
    },
    data: parsed.value,
    select: profileSelect,
  });

  return json({ profile: serializeProfile(updated) });
}
