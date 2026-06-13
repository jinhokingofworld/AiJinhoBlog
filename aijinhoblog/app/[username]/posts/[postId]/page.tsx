import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlogHeroHeader, ProfileSummaryCard } from "@/frontend/components/blog-components";
import { PageFrame } from "@/frontend/components/page-frame";
import { CommentsPanel } from "@/frontend/features/comments/comments-panel";
import { getCurrentUser } from "@/backend/auth";
import {
  canReadPost,
  createPostAccessWhere,
  createPostSummary,
  RECENT_POST_LIMIT,
  serializePost,
} from "@/backend/posts";
import { profileSelect, serializeProfile } from "@/backend/profile";
import { prisma } from "@/backend/prisma";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    username: string;
    postId: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username, postId } = await params;
  const [currentUser, post] = await Promise.all([
    getCurrentUser(),
    prisma.post.findFirst({
      where: {
        id: postId,
        author: {
          username,
        },
      },
      select: {
        title: true,
        excerpt: true,
        content: true,
        authorId: true,
        status: true,
        visibility: true,
      },
    }),
  ]);

  if (!post || !canReadPost(post, currentUser?.id)) {
    return {
      title: "게시글",
      description: "게시글",
    };
  }

  return {
    title: post.title,
    description: createPostSummary(post.excerpt, post.content),
  };
}

export default async function PostDetailPage({ params }: Props) {
  const { username, postId } = await params;
  const [currentUser, post] = await Promise.all([
    getCurrentUser(),
    prisma.post.findFirst({
      where: {
        id: postId,
        author: {
          username,
        },
      },
      include: {
        author: {
          select: profileSelect,
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                email: true,
                username: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        folder: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
    }),
  ]);

  if (!post || !canReadPost(post, currentUser?.id)) {
    notFound();
  }

  const profile = serializeProfile(post.author);
  const serializedPost = serializePost(post);
  const isOwner = currentUser?.id === post.authorId;
  const recentPosts = await prisma.post.findMany({
    where: {
      ...createPostAccessWhere(post.authorId, currentUser?.id),
      id: {
        not: post.id,
      },
    },
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
    take: RECENT_POST_LIMIT,
  });

  return (
    <PageFrame>
      <BlogHeroHeader align="center" profile={profile} titleHref={`/${profile.username}`} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <article className="border border-zinc-300 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-normal">{serializedPost.title}</h1>
                {isOwner && serializedPost.status === "DRAFT" ? (
                  <span className="border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    임시저장
                  </span>
                ) : null}
                {isOwner && serializedPost.visibility === "PRIVATE" ? (
                  <span className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                    비공개
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-zinc-500">
                {new Date(serializedPost.createdAt).toLocaleDateString("ko-KR")}
              </p>
            </div>
            {isOwner ? (
              <Link
                className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                href={`/${profile.username}/posts/${serializedPost.id}/edit`}
              >
                수정
              </Link>
            ) : null}
          </div>

          {serializedPost.folder || serializedPost.tags.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {serializedPost.folder ? (
                <span className="border border-teal-200 bg-teal-50 px-2 py-1 text-xs text-teal-800">
                  {serializedPost.folder.name}
                </span>
              ) : null}
              {serializedPost.tags.map((tag) => (
                <span
                  className="border border-zinc-300 px-2 py-1 text-xs text-zinc-600"
                  key={tag.id}
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          ) : null}

          <p className="mt-6 border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-600">
            {serializedPost.summary}
          </p>

          <div className="mt-8 whitespace-pre-wrap text-base leading-8 text-zinc-800">
            {serializedPost.content}
          </div>

          <CommentsPanel
            currentUser={
              currentUser
                ? {
                    id: currentUser.id,
                    username: currentUser.username,
                    name: currentUser.name,
                  }
                : null
            }
            initialComments={serializedPost.comments ?? []}
            postAuthorId={post.authorId}
            postId={post.id}
          />
        </article>

        <aside className="space-y-6">
          <ProfileSummaryCard imageSize={220} profile={profile} />

          <section className="border border-zinc-300 bg-white p-4">
            <h2 className="text-sm font-semibold">최근 글</h2>
            <div className="mt-4 space-y-2">
              {recentPosts.length ? (
                recentPosts.map((recentPost) => (
                  <Link
                    className="block border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
                    href={`/${profile.username}/posts/${recentPost.id}`}
                    key={recentPost.id}
                  >
                    <p className="font-medium">{recentPost.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                      {createPostSummary(recentPost.excerpt, recentPost.content, 70)}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500">
                  다른 글이 없습니다.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </PageFrame>
  );
}
