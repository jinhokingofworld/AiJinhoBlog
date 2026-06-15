import { attachSessionCookie, getCurrentUser, refreshUserSession } from "@/backend/auth/session";
import { json } from "@/backend/core/http";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser({ allowRefreshToken: false });

  if (user) {
    return json({ user });
  }

  const refreshed = await refreshUserSession();
  const response = json({ user: refreshed?.user ?? null });

  if (refreshed) {
    attachSessionCookie(response, refreshed.tokens);
  }

  return response;
}
