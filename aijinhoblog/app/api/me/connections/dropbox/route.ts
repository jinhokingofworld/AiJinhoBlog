import { attachRefreshedSessionCookie, getCurrentUserOrRefresh } from "@/backend/auth";
import { deleteExternalConnection } from "@/backend/external-connections";
import { fail, json } from "@/backend/http";

export const runtime = "nodejs";

export async function DELETE() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  await deleteExternalConnection(user.id, "DROPBOX");
  const response = json({
    ok: true,
  });

  return attachRefreshedSessionCookie(response, auth);
}
