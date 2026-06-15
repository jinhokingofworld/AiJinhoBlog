import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import { syncPostVectorIndex } from "@/backend/ai/indexing";
import { fail, json } from "@/backend/core/http";
import { prisma } from "@/backend/core/prisma";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    postId: string;
  }>;
};

async function readOwnedPost(postId: string, userId: string) {
  return prisma.post.findFirst({
    where: {
      id: postId,
      authorId: userId,
    },
    select: {
      id: true,
      title: true,
      excerpt: true,
      content: true,
      status: true,
      visibility: true,
      authorId: true,
      folderId: true,
      vectorIndex: true,
    },
  });
}

export async function GET(_request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { postId } = await params;
  const post = await readOwnedPost(postId, user.id);

  if (!post) {
    return failWithRefreshedSession("게시글을 찾을 수 없습니다.", auth, 404);
  }

  const logs = await prisma.aiRequestLog.findMany({
    where: {
      postId,
      userId: user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10,
  });

  const response = json({
    vectorIndex: post.vectorIndex,
    logs,
  });

  return attachRefreshedSessionCookie(response, auth);
}

export async function POST(_request: Request, { params }: Params) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { postId } = await params;
  const post = await readOwnedPost(postId, user.id);

  if (!post) {
    return failWithRefreshedSession("게시글을 찾을 수 없습니다.", auth, 404);
  }

  try {
    await enforceAiRateLimit({
      endpoint: "post.vector-index",
      userId: user.id,
    });
    const aiPipeline = await syncPostVectorIndex(post);
    const response = json({
      aiPipeline,
    });

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    return failWithRefreshedSession("게시글 벡터 인덱싱에 실패했습니다.", auth, 502);
  }
}
