import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { deleteOwnerDropboxMarkdownKnowledge } from "@/backend/integrations/dropbox/indexing";
import { deleteExternalConnection } from "@/backend/integrations/external-connections";
import { fail, json } from "@/backend/core/http";

export const runtime = "nodejs";

export async function DELETE() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const cleanup = await deleteOwnerDropboxMarkdownKnowledge(user.id);

  if (cleanup.failed.length) {
    return failWithRefreshedSession(
      "Dropbox 동기화 문서와 벡터를 정리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      auth,
      502,
    );
  }

  await deleteExternalConnection(user.id, "DROPBOX");
  const response = json({
    cleanup,
    ok: true,
  });

  return attachRefreshedSessionCookie(response, auth);
}
