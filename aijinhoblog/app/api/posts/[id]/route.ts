import { getCurrentUser } from "@/lib/auth";
import { deletePostVectorIndex, syncPostVectorIndex } from "@/lib/ai-indexing";
import { resolvePostFolderId } from "@/lib/folders";
import { fail, json, readJson } from "@/lib/http";
import {
  canReadPost,
  postDetailInclude,
  resolvePublishedAt,
  serializePost,
  toPostTagCreate,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { parsePostPayload } from "@/lib/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: Params) {
  const currentUser = await getCurrentUser();
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: {
      id,
    },
    include: postDetailInclude,
  });

  if (!post || !canReadPost(post, currentUser?.id)) {
    return fail("게시글을 찾을 수 없습니다.", 404);
  }

  return json({ post: serializePost(post) });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { id } = await params;
  const payload = await readJson(request);
  const parsed = parsePostPayload(payload);

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  const post = await prisma.post.findUnique({
    where: {
      id,
    },
    select: {
      authorId: true,
      publishedAt: true,
    },
  });

  if (!post) {
    return fail("게시글을 찾을 수 없습니다.", 404);
  }

  if (post.authorId !== user.id) {
    return fail("게시글 작성자만 수정할 수 있습니다.", 403);
  }

  const folder = await resolvePostFolderId(user.id, parsed.value.folderId);

  if (!folder.ok) {
    return fail(folder.error, 404);
  }

  const [, updatedPost] = await prisma.$transaction([
    prisma.postTag.deleteMany({
      where: {
        postId: id,
      },
    }),
    prisma.post.update({
      where: {
        id,
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
  const aiPipeline = await syncPostVectorIndex(updatedPost);

  return json({ post: serializePost(updatedPost), aiPipeline });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: {
      id,
    },
    select: {
      authorId: true,
    },
  });

  if (!post) {
    return fail("게시글을 찾을 수 없습니다.", 404);
  }

  if (post.authorId !== user.id) {
    return fail("게시글 작성자만 삭제할 수 있습니다.", 403);
  }

  const aiPipeline = await deletePostVectorIndex({
    id,
    authorId: user.id,
  });

  if (aiPipeline.status === "FAILED") {
    return fail(aiPipeline.message, 502);
  }

  await prisma.post.delete({
    where: {
      id,
    },
  });

  return json({ ok: true, aiPipeline });
}
