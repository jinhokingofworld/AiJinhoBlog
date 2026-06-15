import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { AccountSettingsError, changeAccountPassword } from "@/backend/users/account-settings";
import { fail, json, readJson } from "@/backend/core/http";
import { parsePasswordChangePayload } from "@/backend/core/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parsePasswordChangePayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  try {
    await changeAccountPassword({
      input: parsed.value,
      userId: user.id,
    });
    const response = json({ ok: true });

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    if (error instanceof AccountSettingsError) {
      return failWithRefreshedSession(error.message, auth, error.status);
    }

    return failWithRefreshedSession("비밀번호를 변경하지 못했습니다.", auth, 500);
  }
}
