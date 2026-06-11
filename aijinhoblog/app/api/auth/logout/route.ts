import { clearSessionCookie, deleteCurrentSession } from "@/lib/auth";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  await deleteCurrentSession();

  const response = json({ ok: true });
  clearSessionCookie(response);

  return response;
}
