import { getCurrentUser } from "@/lib/auth";
import { syncPostVectorIndex } from "@/lib/ai-indexing";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

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
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { postId } = await params;
  const post = await readOwnedPost(postId, user.id);

  if (!post) {
    return fail("게시글을 찾을 수 없습니다.", 404);
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

  return json({
    vectorIndex: post.vectorIndex,
    logs,
  });
}

export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const { postId } = await params;
  const post = await readOwnedPost(postId, user.id);

  if (!post) {
    return fail("게시글을 찾을 수 없습니다.", 404);
  }

  const aiPipeline = await syncPostVectorIndex(post);

  return json({
    aiPipeline,
  });
}
