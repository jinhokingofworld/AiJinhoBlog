import { prisma } from "@/lib/prisma";

export const DEFAULT_FOLDER_NAME = "기본 폴더";
export const DEFAULT_POST_TITLE = "AiJinhoBlog 시작 글";

export const folderListInclude = {
  _count: {
    select: {
      posts: true,
    },
  },
} as const;

type FolderRecord = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    posts: number;
  };
};

export function serializeFolder(folder: FolderRecord) {
  return {
    id: folder.id,
    name: folder.name,
    position: folder.position,
    isDefault: folder.isDefault,
    postCount: folder._count?.posts ?? 0,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

async function getNextFolderPosition(ownerId: string) {
  const latest = await prisma.folder.findFirst({
    where: {
      ownerId,
    },
    orderBy: {
      position: "desc",
    },
    select: {
      position: true,
    },
  });

  return latest ? latest.position + 1 : 0;
}

export async function ensureDefaultFolder(ownerId: string) {
  const existingDefault = await prisma.folder.findFirst({
    where: {
      ownerId,
      isDefault: true,
    },
    orderBy: {
      position: "asc",
    },
  });

  if (existingDefault) {
    return existingDefault;
  }

  const existingFirst = await prisma.folder.findFirst({
    where: {
      ownerId,
    },
    orderBy: {
      position: "asc",
    },
  });

  if (existingFirst) {
    return prisma.folder.update({
      where: {
        id: existingFirst.id,
      },
      data: {
        isDefault: true,
      },
    });
  }

  return prisma.folder.create({
    data: {
      ownerId,
      name: DEFAULT_FOLDER_NAME,
      position: 0,
      isDefault: true,
    },
  });
}

export async function ensureDefaultBlogContent(ownerId: string) {
  const defaultFolder = await ensureDefaultFolder(ownerId);

  await prisma.post.updateMany({
    where: {
      authorId: ownerId,
      folderId: null,
    },
    data: {
      folderId: defaultFolder.id,
    },
  });

  const postCount = await prisma.post.count({
    where: {
      authorId: ownerId,
    },
  });

  if (postCount === 0) {
    await prisma.post.create({
      data: {
        authorId: ownerId,
        folderId: defaultFolder.id,
        title: DEFAULT_POST_TITLE,
        excerpt: "기본 폴더에 생성된 시작 글입니다.",
        content:
          "AiJinhoBlog에 오신 것을 환영합니다.\n\n이 글은 첫 로그인 직후 기본 폴더와 함께 생성됩니다.",
        status: "PUBLISHED",
        visibility: "PUBLIC",
        publishedAt: new Date(),
      },
    });
  }

  return defaultFolder;
}

export async function resolvePostFolderId(ownerId: string, folderId: string | null) {
  if (!folderId) {
    const defaultFolder = await ensureDefaultFolder(ownerId);
    return {
      ok: true as const,
      folderId: defaultFolder.id,
    };
  }

  const folder = await prisma.folder.findFirst({
    where: {
      id: folderId,
      ownerId,
    },
    select: {
      id: true,
    },
  });

  if (!folder) {
    return {
      ok: false as const,
      error: "폴더를 찾을 수 없습니다.",
    };
  }

  return {
    ok: true as const,
    folderId: folder.id,
  };
}

export async function createFolder(ownerId: string, name: string) {
  const position = await getNextFolderPosition(ownerId);

  return prisma.folder.create({
    data: {
      ownerId,
      name,
      position,
      isDefault: position === 0,
    },
    include: folderListInclude,
  });
}

export async function listFolders(ownerId: string) {
  return prisma.folder.findMany({
    where: {
      ownerId,
    },
    include: folderListInclude,
    orderBy: [
      {
        position: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });
}

export async function moveFolder(ownerId: string, folderId: string, direction: "up" | "down") {
  const folders = await prisma.folder.findMany({
    where: {
      ownerId,
    },
    orderBy: [
      {
        position: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });
  const currentIndex = folders.findIndex((folder) => folder.id === folderId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0) {
    return {
      ok: false as const,
      error: "폴더를 찾을 수 없습니다.",
    };
  }

  if (targetIndex < 0 || targetIndex >= folders.length) {
    return {
      ok: true as const,
    };
  }

  const current = folders[currentIndex];
  const target = folders[targetIndex];

  await prisma.$transaction([
    prisma.folder.update({
      where: {
        id: current.id,
      },
      data: {
        position: target.position,
      },
    }),
    prisma.folder.update({
      where: {
        id: target.id,
      },
      data: {
        position: current.position,
      },
    }),
  ]);

  return {
    ok: true as const,
  };
}
