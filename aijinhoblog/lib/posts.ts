import type { Prisma } from "@/lib/generated/prisma";
import type { PostStatusInput, PostVisibilityInput } from "@/lib/validation";

export const POST_PAGE_SIZE = 6;
export const RECENT_POST_LIMIT = 5;

export type PostListSort = "latest" | "oldest";

export const postSummaryInclude = {
  author: {
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
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
} as const;

export const postDetailInclude = {
  ...postSummaryInclude,
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
} as const;

type TagRecord = {
  tag: {
    id: string;
    name: string;
  };
};

type AuthorRecord = {
  id: string;
  email: string;
  username: string;
  name: string;
};

type CommentRecord = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: AuthorRecord;
};

type PostRecord = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string;
  status: PostStatusInput;
  visibility: PostVisibilityInput;
  publishedAt: Date | null;
  folderId: string | null;
  folder?: {
    id: string;
    name: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
  author: AuthorRecord;
  tags: TagRecord[];
  _count?: {
    comments: number;
  };
  comments?: CommentRecord[];
};

export function normalizePostSort(value: string | null): PostListSort {
  return value === "oldest" ? "oldest" : "latest";
}

export function createPostSummary(excerpt: string | null, content: string, maxLength = 120) {
  const source = (excerpt || content).replace(/\s+/g, " ").trim();

  if (source.length <= maxLength) {
    return source;
  }

  return `${source.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function createPostAccessWhere(authorId: string, currentUserId?: string | null) {
  const where: Prisma.PostWhereInput = {
    authorId,
  };

  if (currentUserId !== authorId) {
    where.status = "PUBLISHED";
    where.visibility = "PUBLIC";
  }

  return where;
}

export function canReadPost(
  post: {
    authorId: string;
    status: PostStatusInput;
    visibility: PostVisibilityInput;
  },
  currentUserId?: string | null,
) {
  return (
    currentUserId === post.authorId || (post.status === "PUBLISHED" && post.visibility === "PUBLIC")
  );
}

export function resolvePublishedAt(
  status: PostStatusInput,
  existingPublishedAt?: Date | null,
  now = new Date(),
) {
  return status === "PUBLISHED" ? (existingPublishedAt ?? now) : null;
}

export function serializeComment(comment: CommentRecord) {
  return {
    id: comment.id,
    content: comment.content,
    author: comment.author,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export function serializePost(post: PostRecord) {
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    summary: createPostSummary(post.excerpt, post.content),
    content: post.content,
    status: post.status,
    visibility: post.visibility,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    folderId: post.folderId,
    folder: post.folder,
    author: post.author,
    tags: post.tags.map(({ tag }) => tag),
    commentCount: post._count?.comments ?? post.comments?.length ?? 0,
    comments: post.comments?.map(serializeComment),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export function toPostTagCreate(tagNames: string[]) {
  return tagNames.map((name) => ({
    tag: {
      connectOrCreate: {
        where: { name },
        create: { name },
      },
    },
  }));
}
