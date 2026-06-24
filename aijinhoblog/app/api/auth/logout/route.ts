import { clearSessionCookie, deleteCurrentSession } from "@/backend/auth/session";
import { json } from "@/backend/core/http";

export const runtime = "nodejs";

export async function POST() {
  await deleteCurrentSession();

  const response = json({ ok: true });
  clearSessionCookie(response);

  return response;
}
