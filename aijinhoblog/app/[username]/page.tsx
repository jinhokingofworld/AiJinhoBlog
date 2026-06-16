import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  BlogHeroHeader,
  FolderDropdown,
  Pagination,
  ProfileSummaryCard,
} from "@/frontend/components/blog-components";
import { PageFrame } from "@/frontend/components/page-frame";
import { logoutAction } from "@/backend/actions/auth-actions";
import { getCurrentUser } from "@/backend/auth/session";
import {
  createPageWindow,
  createPostAccessWhere,
  createPostListFilterWhere,
  createPostSummary,
  normalizePostSort,
  normalizePostSearchQuery,
  type PostListSort,
  POST_PAGE_SIZE,
} from "@/backend/posts/service";
import { profileSelect, serializeProfile } from "@/backend/users/profile";
import { prisma } from "@/backend/core/prisma";
import { parsePositiveInt } from "@/backend/core/validation";

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
    status?: string;
  }>;
};

type OwnerPostStatusFilter = "all" | "published" | "private";

type BlogListHrefOptions = {
  folderId?: string | null;
  page: number;
  query?: string | null;
  sort: PostListSort;
  status?: OwnerPostStatusFilter;
};

function normalizeOwnerPostStatusFilter(value: string | null | undefined): OwnerPostStatusFilter {
  if (value === "published" || value === "private") {
    return value;
  }

  return "all";
}

function createPageHref(
  username: string,
  { folderId, page, query, sort, status }: BlogListHrefOptions,
) {
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

  if (status && status !== "all") {
    params.set("status", status);
  }

  return `/${username}?${params.toString()}`;
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

// 블로그 홈(/:username)의 메인 서버 컴포넌트입니다.
// 읽는 순서: URL 파라미터/쿼리 해석 -> 현재 로그인 유저와 블로그 주인 조회 -> 공개/비공개 접근 조건 생성 -> 게시글 목록 조회 -> JSX 렌더링.
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

  // 실전 구현 포인트: 같은 페이지라도 주인인지 아닌지에 따라 볼 수 있는 데이터가 달라집니다.
  // isOwner가 true면 비공개 글/관리 메뉴를 노출하고, 아니면 공개 글만 보이게 where 조건을 제한합니다.
  const isOwner = currentUser?.id === blog.id;
  const ownerStatusFilter = isOwner ? normalizeOwnerPostStatusFilter(query.status) : "all";
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

  // 목록 기본값은 게시된 글만 보여주는 것입니다.
  // owner 필터가 있으면 아래에서 visibility를 덧붙여 공개/비공개 목록을 나눕니다.
  where.status = "PUBLISHED";

  if (selectedFolderId) {
    where.folderId = selectedFolderId;
  }

  if (isOwner) {
    if (ownerStatusFilter === "published") {
      where.visibility = "PUBLIC";
    }

    if (ownerStatusFilter === "private") {
      where.visibility = "PRIVATE";
    }
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
      _count: {
        select: {
          comments: true,
        },
      },
      createdAt: true,
    },
    skip: (page - 1) * POST_PAGE_SIZE,
    take: POST_PAGE_SIZE,
  });
  const pageNumbers = createPageWindow(page, totalPages);
  const hasActiveFilters = Boolean(searchQuery || selectedFolderId || ownerStatusFilter !== "all");
  const selectedFolder = selectedFolderId
    ? folders.find((folder) => folder.id === selectedFolderId)
    : null;
  const selectedFolderLabel = selectedFolder?.name ?? "전체";
  const menuLinkClass = "block px-4 py-3 text-sm font-medium hover:bg-zinc-100";
  const ownerStatusFilters: Array<{ label: string; value: OwnerPostStatusFilter }> = [
    { label: "전체", value: "all" },
    { label: "공개", value: "published" },
    { label: "비공개", value: "private" },
  ];

  return (
    <PageFrame>
      <BlogHeroHeader
        actions={
          <details className="group relative shrink-0 lg:hidden">
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
                  <Link className={menuLinkClass} href={`/${profile.username}/memory`}>
                    내 기억 Q&amp;A
                  </Link>
                  <Link className={menuLinkClass} href={`/${profile.username}/agent`}>
                    글쓰기 Agent
                  </Link>
                  <Link className={menuLinkClass} href={`/${profile.username}/settings`}>
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
        }
        profile={profile}
      />

      <div className="mt-3 lg:mt-8 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-3">
        <aside className="hidden lg:block">
          <ProfileSummaryCard profile={profile} />

          {isOwner ? (
            <Link
              className="mt-3 block border border-zinc-300 bg-white px-3 py-2 text-center text-base font-semibold hover:bg-zinc-100"
              href={`/${profile.username}/posts/new`}
            >
              글쓰기
            </Link>
          ) : null}

          <section className="mt-3 border border-zinc-300 bg-white p-2">
            <FolderDropdown
              allHref={createPageHref(profile.username, {
                page: 1,
                query: searchQuery,
                sort,
                status: ownerStatusFilter,
              })}
              folders={folders}
              getFolderHref={(folderId) =>
                createPageHref(profile.username, {
                  folderId,
                  page: 1,
                  query: searchQuery,
                  sort,
                  status: ownerStatusFilter,
                })
              }
              selectedFolderId={selectedFolderId}
              selectedFolderLabel={selectedFolderLabel}
            />
          </section>

          {isOwner ? (
            <div className="mt-7 grid gap-2">
              <Link
                className="block border border-zinc-300 bg-white px-3 py-2 text-center text-base font-semibold hover:bg-zinc-100"
                href={`/${profile.username}/memory`}
              >
                내 기억 Q&amp;A
              </Link>
              <Link
                className="block border border-zinc-300 bg-white px-3 py-2 text-center text-base font-semibold hover:bg-zinc-100"
                href={`/${profile.username}/agent`}
              >
                글쓰기 Agent
              </Link>
              <Link
                className="block border border-zinc-300 bg-white px-3 py-2 text-center text-base font-semibold hover:bg-zinc-100"
                href={`/${profile.username}/settings`}
              >
                블로그 설정
              </Link>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0">
          <section className="border border-zinc-300 bg-white px-4 py-5 sm:px-6 lg:hidden">
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

          <section className="mt-3 border border-zinc-300 bg-white p-4 sm:p-5 lg:hidden">
            <div className="grid gap-3">
              <FolderDropdown
                allHref={createPageHref(profile.username, {
                  page: 1,
                  query: searchQuery,
                  sort,
                  status: ownerStatusFilter,
                })}
                folders={folders}
                getFolderHref={(folderId) =>
                  createPageHref(profile.username, {
                    folderId,
                    page: 1,
                    query: searchQuery,
                    sort,
                    status: ownerStatusFilter,
                  })
                }
                selectedFolderId={selectedFolderId}
                selectedFolderLabel={selectedFolderLabel}
              />
            </div>
          </section>

          <section className="mt-3 border border-zinc-300 bg-white p-4 sm:p-6 lg:mt-0">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-4 border-b border-zinc-200 pb-4 sm:flex sm:flex-row sm:items-start sm:justify-between sm:gap-4 lg:items-center">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">글 목록</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  총 {total}개{hasActiveFilters ? " · 필터 적용 중" : ""}
                </p>
              </div>

              <div className="contents sm:flex sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                <form
                  action={`/${profile.username}`}
                  className="order-3 col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] justify-start gap-x-[5px] gap-y-2 sm:order-1 sm:col-span-1 sm:w-auto sm:grid-cols-[16rem_auto_auto] md:grid-cols-[18rem_auto_auto] lg:order-2 lg:grid-cols-[20rem_auto_auto]"
                  method="get"
                >
                  <input name="sort" type="hidden" value={sort} />
                  {isOwner && ownerStatusFilter !== "all" ? (
                    <input name="status" type="hidden" value={ownerStatusFilter} />
                  ) : null}
                  {selectedFolderId ? (
                    <input name="folderId" type="hidden" value={selectedFolderId} />
                  ) : null}
                  <label className="sr-only" htmlFor="post-search">
                    글 검색
                  </label>
                  <input
                    className="h-10 min-w-0 border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
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
                        status: ownerStatusFilter,
                      })}
                    >
                      초기화
                    </Link>
                  ) : null}
                </form>
                <div className="order-2 inline-flex w-fit justify-self-end border border-zinc-300 text-sm sm:order-2 lg:order-1">
                  <Link
                    className={`px-3 py-2 ${sort === "latest" ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
                    href={createPageHref(profile.username, {
                      folderId: selectedFolderId,
                      page: 1,
                      query: searchQuery,
                      sort: "latest",
                      status: ownerStatusFilter,
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
                      status: ownerStatusFilter,
                    })}
                  >
                    오래된순
                  </Link>
                </div>
              </div>
            </div>

            {isOwner ? (
              <div className="mt-4 flex flex-wrap gap-2 border-b border-zinc-200 pb-4 text-sm">
                {ownerStatusFilters.map((filter) => (
                  <Link
                    className={`border border-zinc-300 px-3 py-2 ${
                      ownerStatusFilter === filter.value
                        ? "bg-zinc-950 text-white"
                        : "hover:bg-zinc-50"
                    }`}
                    href={createPageHref(profile.username, {
                      folderId: selectedFolderId,
                      page: 1,
                      query: searchQuery,
                      sort,
                      status: filter.value,
                    })}
                    key={filter.value}
                  >
                    {filter.label}
                  </Link>
                ))}
              </div>
            ) : null}

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
                        {` · 댓글 ${post._count.comments}개`}
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

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-center">
              <div className="lg:hidden">
                {isOwner ? (
                  <Link
                    className="block border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-100 sm:w-40"
                    href={`/${profile.username}/posts/new`}
                  >
                    글쓰기
                  </Link>
                ) : null}
              </div>
              <Pagination
                getPageHref={(pageNumber) =>
                  createPageHref(profile.username, {
                    folderId: selectedFolderId,
                    page: pageNumber,
                    query: searchQuery,
                    sort,
                    status: ownerStatusFilter,
                  })
                }
                page={page}
                pageNumbers={pageNumbers}
                totalPages={totalPages}
              />
            </div>
          </section>
        </div>
      </div>
    </PageFrame>
  );
}
