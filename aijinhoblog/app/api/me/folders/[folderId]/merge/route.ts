import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import { ensureDefaultFolder, listFolders, serializeFolder } from "@/backend/folders";
import { fail, json, readJson } from "@/backend/http";
import { prisma } from "@/backend/prisma";
import { parseFolderMergePayload } from "@/backend/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    folderId: string;
  }>;
};

async function readOwnedFolder(folderId: string, ownerId: string) {
  return prisma.folder.findFirst({
    where: {
      id: folderId,
      ownerId,
    },
  });
}

export async function POST(request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { folderId } = await params;
  const payload = await readJson(request);
  const parsed = parseFolderMergePayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  if (parsed.value.targetFolderId === folderId) {
    return failWithRefreshedSession("같은 폴더로 병합할 수 없습니다.", auth, 400);
  }

  const [sourceFolder, targetFolder] = await Promise.all([
    readOwnedFolder(folderId, user.id),
    readOwnedFolder(parsed.value.targetFolderId, user.id),
  ]);

  if (!sourceFolder || !targetFolder) {
    return failWithRefreshedSession("폴더를 찾을 수 없습니다.", auth, 404);
  }

  await prisma.$transaction([
    prisma.post.updateMany({
      where: {
        authorId: user.id,
        folderId: sourceFolder.id,
      },
      data: {
        folderId: targetFolder.id,
      },
    }),
    prisma.folder.update({
      where: {
        id: targetFolder.id,
      },
      data: {
        isDefault: targetFolder.isDefault || sourceFolder.isDefault,
      },
    }),
    prisma.folder.delete({
      where: {
        id: sourceFolder.id,
      },
    }),
  ]);

  await ensureDefaultFolder(user.id);
  const folders = await listFolders(user.id);
  const response = json({ folders: folders.map(serializeFolder) });

  return attachRefreshedSessionCookie(response, auth);
}
