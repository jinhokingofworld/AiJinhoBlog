import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import {
  ensureDefaultFolder,
  listFolders,
  moveFolder,
  serializeFolder,
} from "@/backend/posts/folders";
import { fail, json, readJson } from "@/backend/core/http";
import { prisma } from "@/backend/core/prisma";
import { parseFolderMovePayload, parseFolderPayload } from "@/backend/core/validation";

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

export async function PATCH(request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { folderId } = await params;
  const payload = await readJson(request);

  if (typeof payload === "object" && payload !== null && "direction" in payload) {
    const parsed = parseFolderMovePayload(payload);

    if (!parsed.ok) {
      return failWithRefreshedSession(parsed.error, auth, 400);
    }

    const moved = await moveFolder(user.id, folderId, parsed.value.direction);

    if (!moved.ok) {
      return failWithRefreshedSession(moved.error, auth, 404);
    }

    const folders = await listFolders(user.id);
    const response = json({ folders: folders.map(serializeFolder) });

    return attachRefreshedSessionCookie(response, auth);
  }

  const parsed = parseFolderPayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  const folder = await readOwnedFolder(folderId, user.id);

  if (!folder) {
    return failWithRefreshedSession("폴더를 찾을 수 없습니다.", auth, 404);
  }

  try {
    await prisma.folder.update({
      where: {
        id: folder.id,
      },
      data: {
        name: parsed.value.name,
      },
    });
  } catch {
    return failWithRefreshedSession("이미 같은 이름의 폴더가 있습니다.", auth, 409);
  }

  const folders = await listFolders(user.id);
  const response = json({ folders: folders.map(serializeFolder) });

  return attachRefreshedSessionCookie(response, auth);
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { folderId } = await params;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "move";
  const targetFolderId = url.searchParams.get("targetFolderId");
  const folder = await readOwnedFolder(folderId, user.id);

  if (!folder) {
    return failWithRefreshedSession("폴더를 찾을 수 없습니다.", auth, 404);
  }

  const folderCount = await prisma.folder.count({
    where: {
      ownerId: user.id,
    },
  });

  if (folderCount <= 1) {
    return failWithRefreshedSession("마지막 폴더는 삭제할 수 없습니다.", auth, 400);
  }

  if (mode === "delete-posts") {
    await prisma.$transaction([
      prisma.post.deleteMany({
        where: {
          authorId: user.id,
          folderId: folder.id,
        },
      }),
      prisma.folder.delete({
        where: {
          id: folder.id,
        },
      }),
    ]);
  } else {
    if (!targetFolderId || targetFolderId === folder.id) {
      return failWithRefreshedSession("게시글을 이동할 대상 폴더가 필요합니다.", auth, 400);
    }

    const targetFolder = await readOwnedFolder(targetFolderId, user.id);

    if (!targetFolder) {
      return failWithRefreshedSession("대상 폴더를 찾을 수 없습니다.", auth, 404);
    }

    await prisma.$transaction([
      prisma.post.updateMany({
        where: {
          authorId: user.id,
          folderId: folder.id,
        },
        data: {
          folderId: targetFolder.id,
        },
      }),
      prisma.folder.delete({
        where: {
          id: folder.id,
        },
      }),
    ]);
  }

  await ensureDefaultFolder(user.id);
  const folders = await listFolders(user.id);
  const response = json({ folders: folders.map(serializeFolder) });

  return attachRefreshedSessionCookie(response, auth);
}
