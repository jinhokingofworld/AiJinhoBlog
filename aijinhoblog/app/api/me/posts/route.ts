import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import { resolvePostFolderId } from "@/backend/folders";
import { fail, json, readJson } from "@/backend/http";
import {
  postSummaryInclude,
  resolvePublishedAt,
  serializePost,
  toPostTagCreate,
} from "@/backend/posts";
import { prisma } from "@/backend/prisma";
import { parsePostPayload } from "@/backend/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const payload = await readJson(request);
  const parsed = parsePostPayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  const folder = await resolvePostFolderId(user.id, parsed.value.folderId);

  if (!folder.ok) {
    return failWithRefreshedSession(folder.error, auth, 404);
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
  const response = json({ post: serializePost(post) }, 201);

  return attachRefreshedSessionCookie(response, auth);
}
