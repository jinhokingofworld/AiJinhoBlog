import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/frontend/components/page-frame";
import { PostForm } from "@/frontend/features/posts/post-form";
import { getCurrentUser } from "@/backend/auth/session";
import { ensureDefaultFolder, listFolders } from "@/backend/posts/folders";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

// 새 글 작성 페이지입니다.
// 서버에서 로그인/소유자 검증과 폴더 목록 준비만 하고, 실제 입력/저장은 PostForm 클라이언트 컴포넌트가 처리합니다.
export default async function NewPostPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  // 글 작성 폼에는 최소 1개 폴더가 필요하므로 기본 폴더를 보장한 뒤 목록을 내려줍니다.
  await ensureDefaultFolder(currentUser.id);
  const folders = await listFolders(currentUser.id);

  return (
    <PageFrame paddingClassName="py-10">
      <section className="mx-auto max-w-4xl border border-zinc-300 bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-normal">글쓰기</h1>
        <div className="mt-6">
          <PostForm
            folders={folders.map((folder) => ({
              id: folder.id,
              name: folder.name,
            }))}
            mode="create"
            username={username}
          />
        </div>
      </section>
    </PageFrame>
  );
}
