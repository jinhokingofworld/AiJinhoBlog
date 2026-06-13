import type { Prisma } from "@/backend/generated/prisma";

import { json } from "@/backend/http";
import {
  createPostListFilterWhere,
  normalizePostSort,
  POST_PAGE_SIZE,
  postSummaryInclude,
  serializePost,
} from "@/backend/posts";
import { prisma } from "@/backend/prisma";
import { parsePositiveInt } from "@/backend/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = parsePositiveInt(url.searchParams.get("page"), 1, {
    min: 1,
    max: 1000,
  });
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), POST_PAGE_SIZE, {
    min: 1,
    max: 30,
  });
  const query = url.searchParams.get("query");
  const tag = url.searchParams.get("tag");
  const sort = normalizePostSort(url.searchParams.get("sort"));
  const folderId = url.searchParams.get("folderId")?.trim();
  const where: Prisma.PostWhereInput = {
    status: "PUBLISHED",
    visibility: "PUBLIC",
  };

  Object.assign(where, createPostListFilterWhere({ query, tag }));

  if (folderId) {
    where.folderId = folderId;
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
  });
}
