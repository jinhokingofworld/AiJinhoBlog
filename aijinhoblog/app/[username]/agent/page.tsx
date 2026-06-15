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

export default async function WritingAgentPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

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
