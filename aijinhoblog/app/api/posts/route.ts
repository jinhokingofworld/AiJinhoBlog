import type { Prisma } from "@/lib/generated/prisma";

import { getCurrentUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import {
  normalizePostSort,
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
  const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, {
    min: 1,
    max: 30,
  });
  const query = url.searchParams.get("query")?.trim();
  const tag = url.searchParams.get("tag")?.trim().toLowerCase();
  const sort = normalizePostSort(url.searchParams.get("sort"));
  const where: Prisma.PostWhereInput = {
    status: "PUBLISHED",
    visibility: "PUBLIC",
  };

  if (query) {
    where.OR = [
      { title: { contains: query } },
      { excerpt: { contains: query } },
      { content: { contains: query } },
    ];
  }

  if (tag) {
    where.tags = {
      some: {
        tag: {
          name: tag,
        },
      },
    };
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

  const post = await prisma.post.create({
    data: {
      title: parsed.value.title,
      excerpt: parsed.value.excerpt,
      content: parsed.value.content,
      status: parsed.value.status,
      visibility: parsed.value.visibility,
      publishedAt: resolvePublishedAt(parsed.value.status),
      authorId: user.id,
      tags: {
        create: toPostTagCreate(parsed.value.tagNames),
      },
    },
    include: postSummaryInclude,
  });

  return json({ post: serializePost(post) }, 201);
}
