import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { json } from "@/backend/core/http";
import {
  createPostListFilterWhere,
  createPostAccessWhere,
  normalizePostSort,
  POST_PAGE_SIZE,
  postSummaryInclude,
  serializePost,
} from "@/backend/posts/service";
import { prisma } from "@/backend/core/prisma";
import { parsePositiveInt } from "@/backend/core/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    username: string;
  }>;
};

export async function GET(request: Request, { params }: Params) {
  const { username } = await params;
  const url = new URL(request.url);
  const page = parsePositiveInt(url.searchParams.get("page"), 1, {
    min: 1,
    max: 1000,
  });
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), POST_PAGE_SIZE, {
    min: 1,
    max: 30,
  });
  const sort = normalizePostSort(url.searchParams.get("sort"));
  const query = url.searchParams.get("query");
  const tag = url.searchParams.get("tag");
  const folderId = url.searchParams.get("folderId")?.trim();
  const [auth, author] = await Promise.all([
    getCurrentUserOrRefresh(),
    prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!author) {
    return failWithRefreshedSession("사용자를 찾을 수 없습니다.", auth, 404);
  }

  const currentUser = auth.user;
  const where = createPostAccessWhere(author.id, currentUser?.id);
  Object.assign(where, createPostListFilterWhere({ query, tag }));

  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        ownerId: author.id,
      },
      select: {
        id: true,
      },
    });

    if (!folder) {
      return failWithRefreshedSession("폴더를 찾을 수 없습니다.", auth, 404);
    }

    where.folderId = folder.id;
  }

  const [total, posts] = await prisma.$transaction([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      include: postSummaryInclude,
      orderBy: {
        createdAt: sort === "oldest" ? "asc" : "desc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const response = json({
    posts: posts.map(serializePost),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    sort,
  });

  return attachRefreshedSessionCookie(response, auth);
}
