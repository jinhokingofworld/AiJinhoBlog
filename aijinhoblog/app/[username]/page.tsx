import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  deleteCurrentSession,
  getCurrentUser,
} from "@/lib/auth";
import {
  createPageWindow,
  createPostAccessWhere,
  createPostListFilterWhere,
  createPostSummary,
  normalizePostSort,
  normalizePostSearchQuery,
  type PostListSort,
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
    query?: string;
    sort?: string;
  }>;
};

type BlogListHrefOptions = {
  folderId?: string | null;
  page: number;
  query?: string | null;
  sort: PostListSort;
};

function createPageHref(username: string, { folderId, page, query, sort }: BlogListHrefOptions) {
  const params = new URLSearchParams({
    page: String(page),
    sort,
  });

  if (folderId) {
    params.set("folderId", folderId);
  }

  if (query) {
    params.set("query", query);
  }

  return `/${username}?${params.toString()}`;
}

async function logoutAction() {
  "use server";

  await deleteCurrentSession();

  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);

  redirect("/login");
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
  const searchQuery = normalizePostSearchQuery(query.query);
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
  Object.assign(where, createPostListFilterWhere({ query: searchQuery }));

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
      tags: {
        select: {
          tag: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      createdAt: true,
    },
    skip: (page - 1) * POST_PAGE_SIZE,
    take: POST_PAGE_SIZE,
  });
  const pageNumbers = createPageWindow(page, totalPages);
  const hasActiveFilters = Boolean(searchQuery || selectedFolderId);
  const selectedFolder = selectedFolderId
    ? folders.find((folder) => folder.id === selectedFolderId)
    : null;
  const selectedFolderLabel = selectedFolder?.name ?? "전체";
  const menuLinkClass = "block px-4 py-3 text-sm font-medium hover:bg-zinc-100";

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-4 py-5 text-zinc-950 sm:px-6 lg:py-8">
      <div className="mx-auto max-w-[1120px]">
        <header
          className="relative overflow-visible border border-zinc-300 bg-white bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.84), rgba(255,255,255,.92)), url(${profile.coverImageUrl})`,
          }}
        >
          <div className="flex min-h-24 items-start justify-between gap-4 px-4 py-4 sm:min-h-32 sm:px-6">
            <div className="min-w-0 pt-1">
              <p className="text-xs font-semibold text-teal-700">AiJinhoBlog</p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal sm:text-3xl">
                {profile.blogTitle}
              </h1>
            </div>

            <details className="group relative shrink-0">
              <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center border border-zinc-300 bg-white hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
                <span className="sr-only">블로그 메뉴 열기</span>
                <span className="flex w-5 flex-col gap-1">
                  <span className="h-px bg-zinc-950" />
                  <span className="h-px bg-zinc-950" />
                  <span className="h-px bg-zinc-950" />
                </span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-56 border border-zinc-300 bg-white shadow-sm">
                <Link className={menuLinkClass} href={`/${profile.username}`}>
                  프로필
                </Link>
                <a className={menuLinkClass} href="#post-search">
                  검색
                </a>
                {isOwner ? (
                  <>
                    <Link className={menuLinkClass} href={`/${profile.username}/posts/new`}>
                      글쓰기
                    </Link>
                    <Link className={menuLinkClass} href={`/${profile.username}/settings/profile`}>
                      프로필 설정
                    </Link>
                    <Link className={menuLinkClass} href={`/${profile.username}/settings/folders`}>
                      블로그 설정
                    </Link>
                  </>
                ) : null}
                {currentUser ? (
                  <>
                    <Link className={menuLinkClass} href={`/${currentUser.username}`}>
                      내 블로그
                    </Link>
                    <form action={logoutAction}>
                      <button
                        className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-zinc-100"
                        type="submit"
                      >
                        로그아웃
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link className={menuLinkClass} href="/login">
                      로그인
                    </Link>
                    <Link className={menuLinkClass} href="/signup">
                      회원가입
                    </Link>
                  </>
                )}
              </div>
            </details>
          </div>
        </header>

        <section className="mt-3 border border-zinc-300 bg-white px-4 py-5 sm:px-6">
          <p className="text-sm font-semibold text-zinc-500">블로그 소개</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{profile.name}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{profile.intro}</p>
            </div>
            {isOwner ? (
              <Link
                className="w-full shrink-0 border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-100 sm:w-auto"
                href={`/${profile.username}/posts/new`}
              >
                글쓰기
              </Link>
            ) : null}
          </div>
        </section>

        <section className="mt-3 border border-zinc-300 bg-white p-4 sm:p-5">
          <div className="grid gap-3">
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center justify-between border border-zinc-300 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>폴더</span>
                <span className="min-w-0 truncate font-normal text-zinc-600">
                  {selectedFolderLabel}
                </span>
              </summary>
              <div className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-auto border border-zinc-300 bg-white shadow-sm">
                <Link
                  className={`block px-4 py-3 text-sm ${selectedFolderId ? "hover:bg-zinc-50" : "bg-zinc-950 text-white"}`}
                  href={createPageHref(profile.username, {
                    page: 1,
                    query: searchQuery,
                    sort,
                  })}
                >
                  전체
                </Link>
                {folders.map((folder) => (
                  <Link
                    className={`block px-4 py-3 text-sm ${selectedFolderId === folder.id ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                    href={createPageHref(profile.username, {
                      folderId: folder.id,
                      page: 1,
                      query: searchQuery,
                      sort,
                    })}
                    key={folder.id}
                  >
                    {folder.name}
                  </Link>
                ))}
              </div>
            </details>
          </div>
        </section>

        <section className="mt-3 border border-zinc-300 bg-white p-4 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-zinc-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">글 목록</h2>
              <p className="mt-1 text-sm text-zinc-500">
                총 {total}개{hasActiveFilters ? " · 필터 적용 중" : ""}
              </p>
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="inline-flex w-fit border border-zinc-300 text-sm">
                <Link
                  className={`px-3 py-2 ${sort === "latest" ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                  href={createPageHref(profile.username, {
                    folderId: selectedFolderId,
                    page: 1,
                    query: searchQuery,
                    sort: "latest",
                  })}
                >
                  최신순
                </Link>
                <Link
                  className={`border-l border-zinc-300 px-3 py-2 ${sort === "oldest" ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                  href={createPageHref(profile.username, {
                    folderId: selectedFolderId,
                    page: 1,
                    query: searchQuery,
                    sort: "oldest",
                  })}
                >
                  오래된순
                </Link>
              </div>
              <form
                action={`/${profile.username}`}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-center"
                method="get"
              >
                <input name="sort" type="hidden" value={sort} />
                {selectedFolderId ? (
                  <input name="folderId" type="hidden" value={selectedFolderId} />
                ) : null}
                <label className="sr-only" htmlFor="post-search">
                  글 검색
                </label>
                <input
                  className="h-10 min-w-0 border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950 sm:w-64"
                  defaultValue={searchQuery ?? ""}
                  id="post-search"
                  name="query"
                  placeholder="제목, 요약, #태그 검색"
                  type="search"
                />
                <button
                  className="h-10 shrink-0 border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
                  type="submit"
                >
                  검색
                </button>
                {searchQuery ? (
                  <Link
                    className="col-span-2 h-10 border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-100 sm:col-span-1"
                    href={createPageHref(profile.username, {
                      folderId: selectedFolderId,
                      page: 1,
                      sort,
                    })}
                  >
                    초기화
                  </Link>
                ) : null}
              </form>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {posts.length ? (
              posts.map((post) => (
                <Link
                  className="flex min-h-28 flex-col border border-zinc-300 px-4 py-4 hover:bg-zinc-50 sm:px-5"
                  href={`/${profile.username}/posts/${post.id}`}
                  key={post.id}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <h3
                      className="min-w-0 flex-1 truncate text-lg font-semibold"
                      title={post.title}
                    >
                      {post.title}
                    </h3>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
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
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
                    {createPostSummary(post.excerpt, post.content)}
                  </p>
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
                    <p className="text-xs text-zinc-500">
                      {post.createdAt.toLocaleDateString("ko-KR")}
                      {post.folder ? ` · ${post.folder.name}` : ""}
                    </p>
                    {post.tags.length ? (
                      <div className="ml-auto flex flex-wrap justify-end gap-1">
                        {post.tags.map(({ tag }) => (
                          <span
                            className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700"
                            key={tag.id}
                          >
                            #{tag.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Link>
              ))
            ) : (
              <div className="border border-dashed border-zinc-300 px-5 py-12 text-center text-sm text-zinc-500">
                {hasActiveFilters ? "조건에 맞는 글이 없습니다." : "아직 공개된 글이 없습니다."}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div>
              {isOwner ? (
                <Link
                  className="block border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-100 sm:w-40"
                  href={`/${profile.username}/posts/new`}
                >
                  글쓰기
                </Link>
              ) : null}
            </div>
            {totalPages > 1 ? (
              <nav className="flex flex-wrap items-center justify-center gap-2 text-sm">
                <Link
                  aria-label="이전 페이지"
                  aria-disabled={page <= 1}
                  className={`border border-zinc-300 px-3 py-2 ${page <= 1 ? "pointer-events-none text-zinc-300" : "hover:bg-zinc-50"}`}
                  href={createPageHref(profile.username, {
                    folderId: selectedFolderId,
                    page: Math.max(1, page - 1),
                    query: searchQuery,
                    sort,
                  })}
                >
                  &lt;
                </Link>
                {pageNumbers.map((pageNumber) => (
                  <Link
                    aria-current={pageNumber === page ? "page" : undefined}
                    className={`border border-zinc-300 px-3 py-2 ${pageNumber === page ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                    href={createPageHref(profile.username, {
                      folderId: selectedFolderId,
                      page: pageNumber,
                      query: searchQuery,
                      sort,
                    })}
                    key={pageNumber}
                  >
                    {pageNumber}
                  </Link>
                ))}
                <Link
                  aria-label="다음 페이지"
                  aria-disabled={page >= totalPages}
                  className={`border border-zinc-300 px-3 py-2 ${page >= totalPages ? "pointer-events-none text-zinc-300" : "hover:bg-zinc-50"}`}
                  href={createPageHref(profile.username, {
                    folderId: selectedFolderId,
                    page: Math.min(totalPages, page + 1),
                    query: searchQuery,
                    sort,
                  })}
                >
                  &gt;
                </Link>
              </nav>
            ) : null}
            <form
              action={`/${profile.username}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:justify-self-end"
              method="get"
            >
              <input name="sort" type="hidden" value={sort} />
              {selectedFolderId ? (
                <input name="folderId" type="hidden" value={selectedFolderId} />
              ) : null}
              <label className="sr-only" htmlFor="post-search-bottom">
                글 검색
              </label>
              <input
                className="h-10 min-w-0 border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950 sm:w-52"
                defaultValue={searchQuery ?? ""}
                id="post-search-bottom"
                name="query"
                placeholder="검색 또는 #태그"
                type="search"
              />
              <button
                className="h-10 border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100"
                type="submit"
              >
                검색
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
