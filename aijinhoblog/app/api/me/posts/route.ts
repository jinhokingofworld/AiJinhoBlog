import { getCurrentUser } from "@/lib/auth";
import { resolvePostFolderId } from "@/lib/folders";
import { fail, json, readJson } from "@/lib/http";
import {
  postSummaryInclude,
  resolvePublishedAt,
  serializePost,
  toPostTagCreate,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { parsePostPayload } from "@/lib/validation";

export const runtime = "nodejs";

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

  return json({ post: serializePost(post) }, 201);
}
