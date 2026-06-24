import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { prisma } from "@/backend/core/prisma";
import { PageFrame } from "@/frontend/components/page-frame";
import { WritingAgentClient } from "@/frontend/features/agent/writing-agent-client";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

// 글쓰기 Agent 페이지입니다.
// 서버에서는 로그인/소유자 확인과 최근 글 목록만 준비하고, 실제 Agent 기능 호출은 WritingAgentClient가 /api/me/agent/*로 수행합니다.
export default async function WritingAgentPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  // Agent UI의 select box에 넣을 대상 게시글 목록입니다.
  // 본문 전체는 여기서 내려주지 않고, 각 Agent API가 필요한 시점에 서버에서 다시 조회합니다.
  const posts = await prisma.post.findMany({
    where: {
      authorId: currentUser.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      title: true,
    },
    take: 50,
  });

  return (
    <PageFrame paddingClassName="py-10">
      <WritingAgentClient posts={posts} username={username} />
    </PageFrame>
  );
}
