import { getCurrentUser } from "@/lib/auth";
import { createFolder, ensureDefaultFolder, listFolders, serializeFolder } from "@/lib/folders";
import { fail, json, readJson } from "@/lib/http";
import { parseFolderPayload } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  await ensureDefaultFolder(user.id);
  const folders = await listFolders(user.id);

  return json({ folders: folders.map(serializeFolder) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parseFolderPayload(payload);

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  try {
    const folder = await createFolder(user.id, parsed.value.name);
    return json({ folder: serializeFolder(folder) }, 201);
  } catch {
    return fail("이미 같은 이름의 폴더가 있습니다.", 409);
  }
}
