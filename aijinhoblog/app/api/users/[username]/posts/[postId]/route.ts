import { getCurrentUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { canReadPost, postDetailInclude, serializePost } from "@/lib/posts";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    username: string;
    postId: string;
  }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { username, postId } = await params;
  const [currentUser, post] = await Promise.all([
    getCurrentUser(),
    prisma.post.findFirst({
      where: {
        id: postId,
        author: {
          username,
        },
      },
      include: postDetailInclude,
    }),
  ]);

  if (!post || !canReadPost(post, currentUser?.id)) {
    return fail("게시글을 찾을 수 없습니다.", 404);
  }

  return json({ post: serializePost(post) });
}
