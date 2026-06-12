import { attachSessionCookie, getCurrentUser, refreshUserSession } from "@/lib/auth";
import { json } from "@/lib/http";

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
