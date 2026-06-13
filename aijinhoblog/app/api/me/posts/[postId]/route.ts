import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import { resolvePostFolderId } from "@/backend/folders";
import { fail, json, readJson } from "@/backend/http";
import {
  postDetailInclude,
  resolvePublishedAt,
  serializePost,
  toPostTagCreate,
} from "@/backend/posts";
import { prisma } from "@/backend/prisma";
import { parsePostPayload } from "@/backend/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    postId: string;
  }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { postId } = await params;
  const payload = await readJson(request);
  const parsed = parsePostPayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
  }

  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    select: {
      authorId: true,
      publishedAt: true,
    },
  });

  if (!post) {
    return failWithRefreshedSession("게시글을 찾을 수 없습니다.", auth, 404);
  }

  if (post.authorId !== user.id) {
    return failWithRefreshedSession("게시글 작성자만 수정할 수 있습니다.", auth, 403);
  }

  const folder = await resolvePostFolderId(user.id, parsed.value.folderId);

  if (!folder.ok) {
    return failWithRefreshedSession(folder.error, auth, 404);
  }

  const [, updatedPost] = await prisma.$transaction([
    prisma.postTag.deleteMany({
      where: {
        postId,
      },
    }),
    prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        title: parsed.value.title,
        excerpt: parsed.value.excerpt,
        content: parsed.value.content,
        status: parsed.value.status,
        visibility: parsed.value.visibility,
        publishedAt: resolvePublishedAt(parsed.value.status, post.publishedAt),
        folderId: folder.folderId,
        tags: {
          create: toPostTagCreate(parsed.value.tagNames),
        },
      },
      include: postDetailInclude,
    }),
  ]);
  const response = json({ post: serializePost(updatedPost) });

  return attachRefreshedSessionCookie(response, auth);
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { postId } = await params;
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    select: {
      authorId: true,
    },
  });

  if (!post) {
    return failWithRefreshedSession("게시글을 찾을 수 없습니다.", auth, 404);
  }

  if (post.authorId !== user.id) {
    return failWithRefreshedSession("게시글 작성자만 삭제할 수 있습니다.", auth, 403);
  }

  await prisma.post.delete({
    where: {
      id: postId,
    },
  });
  const response = json({ ok: true });

  return attachRefreshedSessionCookie(response, auth);
}
