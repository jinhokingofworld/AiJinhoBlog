import { notFound, redirect } from "next/navigation";

import { PostForm } from "@/app/[username]/posts/post-form";
import { getCurrentUser } from "@/lib/auth";
import { ensureDefaultFolder, listFolders } from "@/lib/folders";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{
    username: string;
    postId: string;
  }>;
};

export default async function EditPostPage({ params }: Props) {
  const { username, postId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      authorId: currentUser.id,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });

  if (!post) {
    notFound();
  }

  await ensureDefaultFolder(currentUser.id);
  const folders = await listFolders(currentUser.id);

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-5 py-10 text-zinc-950">
      <section className="mx-auto max-w-2xl border border-zinc-300 bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-normal">글 수정</h1>
        <div className="mt-6">
          <PostForm
            initialPost={{
              id: post.id,
              title: post.title,
              excerpt: post.excerpt,
              content: post.content,
              status: post.status,
              visibility: post.visibility,
              folderId: post.folderId,
              tags: post.tags.map(({ tag }) => ({
                name: tag.name,
              })),
            }}
            folders={folders.map((folder) => ({
              id: folder.id,
              name: folder.name,
            }))}
            mode="edit"
            username={username}
          />
        </div>
      </section>
    </main>
  );
}
