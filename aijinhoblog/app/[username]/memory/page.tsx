import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { PageFrame } from "@/frontend/components/page-frame";
import { MemoryQaClient } from "@/frontend/features/rag/memory-qa-client";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

// 내 기억 Q&A 페이지입니다.
// 서버에서는 로그인/소유자 확인만 하고, 질문 입력과 /api/me/rag/answer 호출은 MemoryQaClient가 처리합니다.
export default async function MemoryPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  return (
    <PageFrame paddingClassName="py-10">
      <MemoryQaClient username={username} />
    </PageFrame>
  );
}
