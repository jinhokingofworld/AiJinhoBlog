import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/frontend/components/page-frame";
import { PostForm } from "@/frontend/features/posts/post-form";
import { getCurrentUser } from "@/backend/auth";
import { ensureDefaultFolder, listFolders } from "@/backend/folders";
import { prisma } from "@/backend/prisma";

type Props = {
  params: Promise<{
    username: string;
    postId: string;
  }>;
  searchParams?: Promise<{
    import?: string;
  }>;
};

export default async function EditPostPage({ params, searchParams }: Props) {
  const { username, postId } = await params;
  const query = await searchParams;
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
    <PageFrame paddingClassName="py-10">
      <section className="mx-auto max-w-4xl border border-zinc-300 bg-white p-6">
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
            initialActiveTab={query?.import === "external" ? "import" : "write"}
            mode="edit"
            username={username}
          />
        </div>
      </section>
    </PageFrame>
  );
}
