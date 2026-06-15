import { attachRefreshedSessionCookie, getCurrentUserOrRefresh } from "@/backend/auth/session";
import { getDropboxOAuthRedirectUri } from "@/backend/integrations/dropbox/oauth";
import { fail, json } from "@/backend/core/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const response = json({
    dropbox: {
      configured: Boolean(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET),
      redirectUri: getDropboxOAuthRedirectUri(new URL(request.url).origin),
    },
  });

  return attachRefreshedSessionCookie(response, auth);
}
