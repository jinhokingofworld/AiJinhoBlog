import { getCurrentUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { id } = await params;
  const comment = await prisma.comment.findUnique({
    where: {
      id,
    },
    include: {
      post: {
        select: {
          authorId: true,
        },
      },
    },
  });

  if (!comment) {
    return fail("댓글을 찾을 수 없습니다.", 404);
  }

  if (comment.authorId !== user.id && comment.post.authorId !== user.id) {
    return fail("댓글 작성자 또는 게시글 작성자만 삭제할 수 있습니다.", 403);
  }

  await prisma.comment.delete({
    where: {
      id,
    },
  });

  return json({ ok: true });
}
