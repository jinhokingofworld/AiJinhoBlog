import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { fail, json, readJson } from "@/backend/core/http";
import { profileSelect, serializeProfile } from "@/backend/users/profile";
import { prisma } from "@/backend/core/prisma";
import { parseProfilePayload } from "@/backend/core/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parseProfilePayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  const updated = await prisma.user.update({
    where: {
      id: user.id,
    },
    data: parsed.value,
    select: profileSelect,
  });

  const response = json({ profile: serializeProfile(updated) });

  return attachRefreshedSessionCookie(response, auth);
}
