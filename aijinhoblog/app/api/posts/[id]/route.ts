import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { json } from "@/backend/core/http";
import { canReadPost, postDetailInclude, serializePost } from "@/backend/posts/service";
import { prisma } from "@/backend/core/prisma";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const currentUser = auth.user;
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: {
      id,
    },
    include: postDetailInclude,
  });

  if (!post || !canReadPost(post, currentUser?.id)) {
    return failWithRefreshedSession("게시글을 찾을 수 없습니다.", auth, 404);
  }
  const response = json({ post: serializePost(post) });

  return attachRefreshedSessionCookie(response, auth);
}
