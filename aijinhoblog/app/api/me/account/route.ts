import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import { AccountSettingsError, updateAccountSettings } from "@/backend/account-settings";
import { fail, json, readJson } from "@/backend/http";
import { parseAccountSettingsPayload } from "@/backend/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parseAccountSettingsPayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  try {
    const account = await updateAccountSettings({
      input: parsed.value,
      userId: user.id,
    });
    const response = json({ account });

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    if (error instanceof AccountSettingsError) {
      return failWithRefreshedSession(error.message, auth, error.status);
    }

    return failWithRefreshedSession("계정 설정을 저장하지 못했습니다.", auth, 500);
  }
}
