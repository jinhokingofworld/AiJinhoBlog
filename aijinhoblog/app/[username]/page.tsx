import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export default async function UserBlogPage({ params }: Props) {
  const { username } = await params;
  const [currentUser, blog] = await Promise.all([
    getCurrentUser(),
    prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
        username: true,
        name: true,
        posts: {
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            title: true,
            excerpt: true,
            content: true,
            createdAt: true,
          },
          take: 10,
        },
      },
    }),
  ]);

  if (!blog) {
    notFound();
  }

  const isOwner = currentUser?.id === blog.id;

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-5 py-8 text-zinc-950">
      <div className="mx-auto max-w-[1080px]">
        <header className="flex min-h-48 items-center justify-center border border-zinc-300 bg-white px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">{blog.name}</h1>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section className="border border-zinc-300 bg-white p-4">
              <div className="flex aspect-square items-center justify-center border border-zinc-300 bg-zinc-50 text-sm text-zinc-500">
                프로필 이미지
              </div>
              <p className="mt-3 text-base font-semibold">{blog.name}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                안녕하세요 {blog.username}입니다.
              </p>
              {isOwner ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    className="rounded-md border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
                    href={`/${blog.username}/posts/new`}
                  >
                    글쓰기
                  </Link>
                  <Link
                    className="rounded-md border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
                    href={`/${blog.username}/settings/profile`}
                  >
                    프로필설정
                  </Link>
                </div>
              ) : null}
            </section>

            <section className="border border-zinc-300 bg-white p-4">
              <h2 className="text-sm font-semibold">폴더</h2>
              <div className="mt-4 space-y-2">
                <div className="border border-zinc-300 px-3 py-2 text-sm">기본 폴더</div>
              </div>
              {isOwner ? (
                <Link
                  className="mt-5 block rounded-md border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
                  href={`/${blog.username}/settings/folders`}
                >
                  폴더 관리
                </Link>
              ) : null}
            </section>
          </aside>

          <section className="border border-zinc-300 bg-white p-6">
            <div className="space-y-4">
              {blog.posts.length ? (
                blog.posts.map((post) => (
                  <Link
                    className="block border border-zinc-300 px-5 py-4 hover:bg-zinc-50"
                    href={`/${blog.username}/posts/${post.id}`}
                    key={post.id}
                  >
                    <h2 className="text-lg font-semibold">{post.title}</h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
                      {post.excerpt || post.content}
                    </p>
                    <p className="mt-3 text-xs text-zinc-500">
                      {post.createdAt.toLocaleDateString("ko-KR")}
                    </p>
                  </Link>
                ))
              ) : (
                <div className="border border-dashed border-zinc-300 px-5 py-12 text-center text-sm text-zinc-500">
                  아직 공개된 글이 없습니다.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
