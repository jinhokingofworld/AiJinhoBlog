import type { Prisma } from "@/lib/generated/prisma";

import { syncPostVectorIndex } from "@/lib/ai-indexing";
import { getCurrentUser } from "@/lib/auth";
import { resolvePostFolderId } from "@/lib/folders";
import { fail, json, readJson } from "@/lib/http";
import {
  createPostListFilterWhere,
  normalizePostSort,
  POST_PAGE_SIZE,
  postSummaryInclude,
  resolvePublishedAt,
  serializePost,
  toPostTagCreate,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { parsePositiveInt, parsePostPayload } from "@/lib/validation";

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

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parsePostPayload(payload);

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  const folder = await resolvePostFolderId(user.id, parsed.value.folderId);

  if (!folder.ok) {
    return fail(folder.error, 404);
  }

  const post = await prisma.post.create({
    data: {
      title: parsed.value.title,
      excerpt: parsed.value.excerpt,
      content: parsed.value.content,
      status: parsed.value.status,
      visibility: parsed.value.visibility,
      publishedAt: resolvePublishedAt(parsed.value.status),
      authorId: user.id,
      folderId: folder.folderId,
      tags: {
        create: toPostTagCreate(parsed.value.tagNames),
      },
    },
    include: postSummaryInclude,
  });
  const aiPipeline = await syncPostVectorIndex(post);

  return json({ post: serializePost(post), aiPipeline }, 201);
}
