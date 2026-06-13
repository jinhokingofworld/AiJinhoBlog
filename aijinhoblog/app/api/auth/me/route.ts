import { attachSessionCookie, getCurrentUser, refreshUserSession } from "@/backend/auth";
import { json } from "@/backend/http";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

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
