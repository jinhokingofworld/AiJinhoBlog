import { getCurrentUser } from "@/backend/auth";
import { ensureDefaultFolder, listFolders, moveFolder, serializeFolder } from "@/backend/folders";
import { fail, json, readJson } from "@/backend/http";
import { prisma } from "@/backend/prisma";
import { parseFolderMovePayload, parseFolderPayload } from "@/backend/validation";

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
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { folderId } = await params;
  const payload = await readJson(request);

  if (typeof payload === "object" && payload !== null && "direction" in payload) {
    const parsed = parseFolderMovePayload(payload);

    if (!parsed.ok) {
      return fail(parsed.error, 400);
    }

    const moved = await moveFolder(user.id, folderId, parsed.value.direction);

    if (!moved.ok) {
      return fail(moved.error, 404);
    }

    const folders = await listFolders(user.id);
    return json({ folders: folders.map(serializeFolder) });
  }

  const parsed = parseFolderPayload(payload);

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  const folder = await readOwnedFolder(folderId, user.id);

  if (!folder) {
    return fail("폴더를 찾을 수 없습니다.", 404);
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
    return fail("이미 같은 이름의 폴더가 있습니다.", 409);
  }

  const folders = await listFolders(user.id);
  return json({ folders: folders.map(serializeFolder) });
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { folderId } = await params;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "move";
  const targetFolderId = url.searchParams.get("targetFolderId");
  const folder = await readOwnedFolder(folderId, user.id);

  if (!folder) {
    return fail("폴더를 찾을 수 없습니다.", 404);
  }

  const folderCount = await prisma.folder.count({
    where: {
      ownerId: user.id,
    },
  });

  if (folderCount <= 1) {
    return fail("마지막 폴더는 삭제할 수 없습니다.", 400);
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
      return fail("게시글을 이동할 대상 폴더가 필요합니다.", 400);
    }

    const targetFolder = await readOwnedFolder(targetFolderId, user.id);

    if (!targetFolder) {
      return fail("대상 폴더를 찾을 수 없습니다.", 404);
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
  return json({ folders: folders.map(serializeFolder) });
}
