import { attachRefreshedSessionCookie, getCurrentUserOrRefresh } from "@/backend/auth";
import { listExternalConnections } from "@/backend/external-connections";
import { fail, json } from "@/backend/http";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const connections = await listExternalConnections(user.id);
  const response = json({
    connections,
  });

  return attachRefreshedSessionCookie(response, auth);
}
