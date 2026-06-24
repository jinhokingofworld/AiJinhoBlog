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

// 벡터 인덱싱 대상 게시글을 읽는 공통 함수입니다.
// 실전 구현 포인트: postId만으로 찾지 않고 authorId를 함께 걸어 다른 사용자의 글을 인덱싱하지 못하게 합니다.
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

// GET /api/me/posts/:postId/vector-index
// 현재 게시글의 벡터 인덱스 상태와 최근 AI 로그를 확인하는 디버깅/상태 조회 API입니다.
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

// POST /api/me/posts/:postId/vector-index
// 게시글 본문을 다시 chunking -> embedding -> ChromaDB upsert 하는 수동 재인덱싱 API입니다.
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
    // OpenAI embedding과 ChromaDB 작업이 발생하므로 AI rate limit을 적용합니다.
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
