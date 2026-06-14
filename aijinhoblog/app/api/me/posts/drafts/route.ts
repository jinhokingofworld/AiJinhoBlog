import { attachRefreshedSessionCookie, getCurrentUserOrRefresh } from "@/backend/auth";
import { fail, json } from "@/backend/http";
import { listOwnerDraftPosts } from "@/backend/posts";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const response = json({
    drafts: await listOwnerDraftPosts(user.id),
  });

  return attachRefreshedSessionCookie(response, auth);
}
