import { clearSessionCookie, deleteCurrentSession } from "@/backend/auth";
import { json } from "@/backend/http";

export const runtime = "nodejs";

export async function POST() {
  await deleteCurrentSession();

  const response = json({ ok: true });
  clearSessionCookie(response);

  return response;
}
