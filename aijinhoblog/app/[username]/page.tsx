import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { profileSelect, serializeProfile } from "@/lib/profile";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: {
      username,
    },
    select: {
      blogTitle: true,
      name: true,
    },
  });

  return {
    title: user?.blogTitle ?? "AiJinhoBlog",
    description: user ? `${user.name}의 블로그` : "AiJinhoBlog",
  };
}

export default async function UserBlogPage({ params }: Props) {
  const { username } = await params;
  const [currentUser, blog] = await Promise.all([
    getCurrentUser(),
    prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        ...profileSelect,
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
  const profile = serializeProfile(blog);

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-5 py-8 text-zinc-950">
      <div className="mx-auto max-w-[1080px]">
        <header
          className="flex min-h-52 items-center justify-center border border-zinc-300 bg-cover bg-center px-6 text-center"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.72), rgba(255,255,255,.72)), url(${profile.coverImageUrl})`,
          }}
        >
          <div>
            <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">{profile.blogTitle}</h1>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <section className="border border-zinc-300 bg-white p-4">
              <Image
                alt={`${profile.name} 프로필 이미지`}
                className="aspect-square w-full border border-zinc-300 bg-zinc-50 object-cover"
                height={180}
                src={profile.profileImageUrl}
                width={180}
              />
              <p className="mt-3 text-base font-semibold">{profile.name}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{profile.intro}</p>
              {isOwner ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link
                    className="rounded-md border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
                    href={`/${profile.username}/posts/new`}
                  >
                    글쓰기
                  </Link>
                  <Link
                    className="rounded-md border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
                    href={`/${profile.username}/settings/profile`}
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
                  href={`/${profile.username}/settings/folders`}
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
                    href={`/${profile.username}/posts/${post.id}`}
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
