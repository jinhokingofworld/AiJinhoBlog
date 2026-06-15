import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { PageFrame } from "@/frontend/components/page-frame";
import { MemoryQaClient } from "@/frontend/features/rag/memory-qa-client";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

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
