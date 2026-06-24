import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import {
  createFolder,
  ensureDefaultFolder,
  listFolders,
  serializeFolder,
} from "@/backend/posts/folders";
import { fail, json, readJson } from "@/backend/core/http";
import { parseFolderPayload } from "@/backend/core/validation";

export const runtime = "nodejs";

export async function GET() {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  await ensureDefaultFolder(user.id);
  const folders = await listFolders(user.id);
  const response = json({ folders: folders.map(serializeFolder) });

  return attachRefreshedSessionCookie(response, auth);
}

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parseFolderPayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  try {
    const folder = await createFolder(user.id, parsed.value.name);
    const response = json({ folder: serializeFolder(folder) }, 201);

    return attachRefreshedSessionCookie(response, auth);
  } catch {
    return failWithRefreshedSession("이미 같은 이름의 폴더가 있습니다.", auth, 409);
  }
}
