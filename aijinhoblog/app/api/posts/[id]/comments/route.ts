import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { fail, json, readJson } from "@/backend/core/http";
import { canReadPost, serializeComment } from "@/backend/posts/service";
import { prisma } from "@/backend/core/prisma";
import { parseCommentPayload } from "@/backend/core/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { id } = await params;
  const payload = await readJson(request);
  const parsed = parseCommentPayload(payload);

  if (!parsed.ok) {
    return failWithRefreshedSession(parsed.error, auth, 400);
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
    return failWithRefreshedSession("게시글을 찾을 수 없습니다.", auth, 404);
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
          username: true,
          name: true,
        },
      },
    },
  });

  const response = json({ comment: serializeComment(comment) }, 201);

  return attachRefreshedSessionCookie(response, auth);
}
