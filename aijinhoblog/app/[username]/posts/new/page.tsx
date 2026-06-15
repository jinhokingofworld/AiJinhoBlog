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

export default async function NewPostPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

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
