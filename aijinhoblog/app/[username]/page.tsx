import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import {
  createPostAccessWhere,
  createPostSummary,
  normalizePostSort,
  POST_PAGE_SIZE,
} from "@/lib/posts";
import { profileSelect, serializeProfile } from "@/lib/profile";
import { prisma } from "@/lib/prisma";
import { parsePositiveInt } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    username: string;
  }>;
  searchParams?: Promise<{
    folderId?: string;
    page?: string;
    sort?: string;
  }>;
};

function createPageHref(username: string, page: number, sort: string, folderId?: string | null) {
  const params = new URLSearchParams({
    page: String(page),
    sort,
  });

  if (folderId) {
    params.set("folderId", folderId);
  }

  return `/${username}?${params.toString()}`;
}

function createPageNumbers(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

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

export default async function UserBlogPage({ params, searchParams }: Props) {
  const { username } = await params;
  const query = (await searchParams) ?? {};
  const requestedPage = parsePositiveInt(query.page ?? null, 1, {
    min: 1,
    max: 1000,
  });
  const sort = normalizePostSort(query.sort ?? null);
  const selectedFolderId = query.folderId?.trim() || null;
  const [currentUser, blog] = await Promise.all([
    getCurrentUser(),
    prisma.user.findUnique({
      where: {
        username,
      },
      select: profileSelect,
    }),
  ]);

  if (!blog) {
    notFound();
  }

  const isOwner = currentUser?.id === blog.id;
  const profile = serializeProfile(blog);
  const folders = await prisma.folder.findMany({
    where: {
      ownerId: blog.id,
      ...(isOwner
        ? {}
        : {
            posts: {
              some: {
                status: "PUBLISHED",
                visibility: "PUBLIC",
              },
            },
          }),
    },
    orderBy: [
      {
        position: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    select: {
      id: true,
      name: true,
    },
  });
  const visibleFolderIds = new Set(folders.map((folder) => folder.id));

  if (selectedFolderId && !visibleFolderIds.has(selectedFolderId)) {
    notFound();
  }

  const where = createPostAccessWhere(blog.id, currentUser?.id);

  if (selectedFolderId) {
    where.folderId = selectedFolderId;
  }

  const total = await prisma.post.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / POST_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const posts = await prisma.post.findMany({
    where,
    orderBy: {
      createdAt: sort === "oldest" ? "asc" : "desc",
    },
    select: {
      id: true,
      title: true,
      excerpt: true,
      content: true,
      status: true,
      visibility: true,
      folder: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
    },
    skip: (page - 1) * POST_PAGE_SIZE,
    take: POST_PAGE_SIZE,
  });
  const pageNumbers = createPageNumbers(page, totalPages);

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
                <Link
                  className={`block border border-zinc-300 px-3 py-2 text-sm ${selectedFolderId ? "hover:bg-zinc-50" : "bg-zinc-950 text-white"}`}
                  href={createPageHref(profile.username, 1, sort)}
                >
                  전체
                </Link>
                {folders.length ? (
                  folders.map((folder) => (
                    <Link
                      className={`block border border-zinc-300 px-3 py-2 text-sm ${selectedFolderId === folder.id ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                      href={createPageHref(profile.username, 1, sort, folder.id)}
                      key={folder.id}
                    >
                      {folder.name}
                    </Link>
                  ))
                ) : (
                  <div className="border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500">
                    폴더가 없습니다.
                  </div>
                )}
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
            <div className="mb-5 flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">글 목록</h2>
                <p className="mt-1 text-sm text-zinc-500">총 {total}개</p>
              </div>
              <div className="inline-flex w-fit border border-zinc-300 text-sm">
                <Link
                  className={`px-3 py-2 ${sort === "latest" ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                  href={createPageHref(profile.username, 1, "latest", selectedFolderId)}
                >
                  최신순
                </Link>
                <Link
                  className={`border-l border-zinc-300 px-3 py-2 ${sort === "oldest" ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                  href={createPageHref(profile.username, 1, "oldest", selectedFolderId)}
                >
                  오래된순
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              {posts.length ? (
                posts.map((post) => (
                  <Link
                    className="block border border-zinc-300 px-5 py-4 hover:bg-zinc-50"
                    href={`/${profile.username}/posts/${post.id}`}
                    key={post.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{post.title}</h3>
                      {isOwner && post.status === "DRAFT" ? (
                        <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                          임시저장
                        </span>
                      ) : null}
                      {isOwner && post.visibility === "PRIVATE" ? (
                        <span className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                          비공개
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
                      {createPostSummary(post.excerpt, post.content)}
                    </p>
                    <p className="mt-3 text-xs text-zinc-500">
                      {post.createdAt.toLocaleDateString("ko-KR")}
                      {post.folder ? ` · ${post.folder.name}` : ""}
                    </p>
                  </Link>
                ))
              ) : (
                <div className="border border-dashed border-zinc-300 px-5 py-12 text-center text-sm text-zinc-500">
                  아직 공개된 글이 없습니다.
                </div>
              )}
            </div>

            {totalPages > 1 ? (
              <nav className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
                <Link
                  aria-disabled={page <= 1}
                  className={`border border-zinc-300 px-3 py-2 ${page <= 1 ? "pointer-events-none text-zinc-300" : "hover:bg-zinc-50"}`}
                  href={createPageHref(
                    profile.username,
                    Math.max(1, page - 1),
                    sort,
                    selectedFolderId,
                  )}
                >
                  이전
                </Link>
                {pageNumbers.map((pageNumber) => (
                  <Link
                    className={`border border-zinc-300 px-3 py-2 ${pageNumber === page ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                    href={createPageHref(profile.username, pageNumber, sort, selectedFolderId)}
                    key={pageNumber}
                  >
                    {pageNumber}
                  </Link>
                ))}
                <Link
                  aria-disabled={page >= totalPages}
                  className={`border border-zinc-300 px-3 py-2 ${page >= totalPages ? "pointer-events-none text-zinc-300" : "hover:bg-zinc-50"}`}
                  href={createPageHref(
                    profile.username,
                    Math.min(totalPages, page + 1),
                    sort,
                    selectedFolderId,
                  )}
                >
                  다음
                </Link>
              </nav>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
