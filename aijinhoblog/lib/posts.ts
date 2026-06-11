export const postSummaryInclude = {
  author: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  tags: {
    include: {
      tag: true,
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
  createdAt: Date;
  updatedAt: Date;
  author: AuthorRecord;
  tags: TagRecord[];
  _count?: {
    comments: number;
  };
  comments?: CommentRecord[];
};

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
    content: post.content,
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
