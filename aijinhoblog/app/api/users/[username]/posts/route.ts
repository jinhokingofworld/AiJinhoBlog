import { getCurrentUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import {
  createPostListFilterWhere,
  createPostAccessWhere,
  normalizePostSort,
  POST_PAGE_SIZE,
  postSummaryInclude,
  serializePost,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { parsePositiveInt } from "@/lib/validation";

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
  const [currentUser, author] = await Promise.all([
    getCurrentUser(),
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
    return fail("사용자를 찾을 수 없습니다.", 404);
  }

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
      return fail("폴더를 찾을 수 없습니다.", 404);
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

  return json({
    posts: posts.map(serializePost),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    sort,
  });
}
