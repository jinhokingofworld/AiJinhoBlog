import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/frontend/components/page-frame";
import { PostForm } from "@/frontend/features/posts/post-form";
import { getCurrentUser } from "@/backend/auth/session";
import { ensureDefaultFolder, listFolders } from "@/backend/posts/folders";
import { prisma } from "@/backend/core/prisma";

type Props = {
  params: Promise<{
    username: string;
    postId: string;
  }>;
};

// 글 수정 페이지입니다.
// 서버에서 현재 유저가 URL의 username 주인인지 확인하고, 수정 대상 글을 initialPost로 PostForm에 넘깁니다.
export default async function EditPostPage({ params }: Props) {
  const { username, postId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  // 실전 구현 포인트: 수정 페이지는 postId만 믿지 않고 authorId까지 함께 확인합니다.
  // 이 조건이 없으면 다른 사용자의 postId를 URL에 넣어 수정 폼을 볼 수 있습니다.
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
            mode="edit"
            username={username}
          />
        </div>
      </section>
    </PageFrame>
  );
}
