import { getCurrentUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { canReadPost, serializeComment } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { parseCommentPayload } from "@/lib/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { id } = await params;
  const payload = await readJson(request);
  const parsed = parseCommentPayload(payload);

  if (!parsed.ok) {
    return fail(parsed.error, 400);
  }

  const post = await prisma.post.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      authorId: true,
      status: true,
      visibility: true,
    },
  });

  if (!post || !canReadPost(post, user.id)) {
    return fail("게시글을 찾을 수 없습니다.", 404);
  }

  const comment = await prisma.comment.create({
    data: {
      postId: id,
      authorId: user.id,
      content: parsed.value.content,
    },
    include: {
      author: {
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
        },
      },
    },
  });

  return json({ comment: serializeComment(comment) }, 201);
}
