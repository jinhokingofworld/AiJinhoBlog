import type { Prisma } from "@/backend/generated/prisma";
import {
  deletePostVectorIndex as defaultDeletePostVectorIndex,
  syncPostVectorIndex as defaultSyncPostVectorIndex,
  type VectorPipelineResult,
} from "@/backend/ai/indexing";
import {
  GenerationProviderError,
  GenerationSkippedError,
  createOpenAIGenerationClient,
  type GenerationClient,
} from "@/backend/ai/generation";
import type { PostStatusInput, PostVisibilityInput } from "@/backend/core/validation";
import { resolvePostFolderId } from "@/backend/posts/folders";
import { prisma } from "@/backend/core/prisma";
import { type PostInput } from "@/backend/core/validation";

export const POST_PAGE_SIZE = 5;
export const POST_PAGE_WINDOW_SIZE = 3;
export const RECENT_POST_LIMIT = 5;
export const POST_EXCERPT_MAX_LENGTH = 180;
export const POST_EXCERPT_SYSTEM_PROMPT =
  "너는 개인 블로그 글의 목록용 요약을 작성하는 편집자다. 제공된 제목과 본문에 근거해서만 한국어 Plain Text 한 문장으로 요약한다. Markdown 문법, 목록 기호, 제목, 따옴표, HTML 태그를 쓰지 않는다. 본문에 없는 내용은 추측하지 않는다. 120자 이내로 작성한다.";

export type PostListSort = "latest" | "oldest";

export const postSummaryInclude = {
  author: {
    select: {
      id: true,
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
  authorId: string;
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

type PostVectorInput = Pick<
  PostRecord,
  "authorId" | "content" | "excerpt" | "folderId" | "id" | "status" | "title" | "visibility"
>;

type PostServiceDependencies = {
  deletePostVectorIndex?: typeof defaultDeletePostVectorIndex;
  generationClient?: GenerationClient;
  syncPostVectorIndex?: typeof defaultSyncPostVectorIndex;
};

export function normalizePostSort(value: string | null): PostListSort {
  return value === "oldest" ? "oldest" : "latest";
}

export function normalizePostSearchQuery(value: string | null | undefined) {
  const query = value?.trim() ?? "";

  return query || null;
}

export function normalizePostTagFilter(value: string | null | undefined) {
  const tag = value?.trim().replace(/^#+/, "").toLowerCase() ?? "";

  return tag || null;
}

const SEARCH_HASHTAG_PATTERN = /#[^\s#]+/g;

function splitPostSearchQuery(query: string | null) {
  const tags = new Set<string>();

  if (!query) {
    return {
      keyword: null,
      tags: [],
    };
  }

  const keyword = query
    .replace(SEARCH_HASHTAG_PATTERN, (token) => {
      const tag = normalizePostTagFilter(token.replace(/[.,!?;:)]+$/, ""));

      if (tag) {
        tags.add(tag);
      }

      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();

  return {
    keyword: keyword || null,
    tags: Array.from(tags),
  };
}

export function createPostListFilterWhere({
  query,
  tag,
}: {
  query?: string | null;
  tag?: string | null;
}) {
  const normalizedQuery = normalizePostSearchQuery(query);
  const normalizedTag = normalizePostTagFilter(tag);
  const search = splitPostSearchQuery(normalizedQuery);
  const tags = new Set(search.tags);
  const where: Prisma.PostWhereInput = {};

  if (normalizedTag) {
    tags.add(normalizedTag);
  }

  if (search.keyword) {
    where.OR = [
      { title: { contains: search.keyword } },
      { excerpt: { contains: search.keyword } },
      { content: { contains: search.keyword } },
    ];
  }

  const tagList = Array.from(tags);

  if (tagList.length === 1) {
    where.tags = {
      some: {
        tag: {
          name: tagList[0],
        },
      },
    };
  }

  if (tagList.length > 1) {
    where.tags = {
      some: {
        tag: {
          name: {
            in: tagList,
          },
        },
      },
    };
  }

  return where;
}

export function createPageWindow(currentPage: number, totalPages: number) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const halfWindow = Math.floor(POST_PAGE_WINDOW_SIZE / 2);
  let start = Math.max(1, safeCurrentPage - halfWindow);
  const end = Math.min(safeTotalPages, start + POST_PAGE_WINDOW_SIZE - 1);

  start = Math.max(1, end - POST_PAGE_WINDOW_SIZE + 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function createPostSummary(excerpt: string | null, content: string, maxLength = 120) {
  const source = (excerpt || content).replace(/\s+/g, " ").trim();

  if (source.length <= maxLength) {
    return source;
  }

  return `${source.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function sanitizeGeneratedExcerpt(value: string, maxLength = POST_EXCERPT_MAX_LENGTH) {
  const plain = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/[#*_`>\[\]]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return truncateText(plain, maxLength);
}

export function createFallbackPostExcerpt({
  content,
  title,
}: Pick<PostInput, "content" | "title">) {
  return createPostSummary(null, content || title, POST_EXCERPT_MAX_LENGTH) || null;
}

export async function generatePostExcerpt(
  input: Pick<PostInput, "content" | "title">,
  generationClient: GenerationClient = createOpenAIGenerationClient(),
) {
  const fallback = createFallbackPostExcerpt(input);

  if (!input.content.trim()) {
    return fallback;
  }

  try {
    const generated = await generationClient.generateAnswer({
      context: `제목:\n${input.title}\n\n본문:\n${input.content.slice(0, 6000)}`,
      question: "이 블로그 글의 목록용 요약을 한 문장으로 작성해줘.",
      systemPrompt: POST_EXCERPT_SYSTEM_PROMPT,
      temperature: 0.1,
    });
    const excerpt = sanitizeGeneratedExcerpt(generated.text);

    return excerpt || fallback;
  } catch (error) {
    if (error instanceof GenerationSkippedError || error instanceof GenerationProviderError) {
      return fallback;
    }

    throw error;
  }
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

export type SerializedPost = ReturnType<typeof serializePost>;

export type PostMutationResult = {
  aiPipeline: VectorPipelineResult;
  post: SerializedPost;
};

export type SerializedDraftPost = Pick<
  SerializedPost,
  | "content"
  | "createdAt"
  | "excerpt"
  | "folderId"
  | "id"
  | "status"
  | "tags"
  | "title"
  | "updatedAt"
  | "visibility"
>;

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

export class PostServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PostServiceError";
    this.status = status;
  }
}

async function syncPostVector(post: PostVectorInput, dependencies: PostServiceDependencies = {}) {
  const syncPostVectorIndex = dependencies.syncPostVectorIndex ?? defaultSyncPostVectorIndex;

  return syncPostVectorIndex(post);
}

async function deletePostVector(
  post: Pick<PostVectorInput, "authorId" | "id">,
  dependencies: PostServiceDependencies = {},
) {
  const deletePostVectorIndex = dependencies.deletePostVectorIndex ?? defaultDeletePostVectorIndex;

  return deletePostVectorIndex(post);
}

export async function createOwnerPost(
  ownerId: string,
  input: PostInput,
  dependencies: PostServiceDependencies = {},
): Promise<PostMutationResult> {
  const folder = await resolvePostFolderId(ownerId, input.folderId);

  if (!folder.ok) {
    throw new PostServiceError(folder.error, 404);
  }

  const excerpt = await generatePostExcerpt(input, dependencies.generationClient);
  const post = await prisma.post.create({
    data: {
      title: input.title,
      excerpt,
      content: input.content,
      status: input.status,
      visibility: input.visibility,
      publishedAt: resolvePublishedAt(input.status),
      authorId: ownerId,
      folderId: folder.folderId,
      tags: {
        create: toPostTagCreate(input.tagNames),
      },
    },
    include: postSummaryInclude,
  });
  const aiPipeline = await syncPostVector(post, dependencies);

  return {
    aiPipeline,
    post: serializePost(post),
  };
}

export async function updateOwnerPost(
  ownerId: string,
  postId: string,
  input: PostInput,
  dependencies: PostServiceDependencies = {},
): Promise<PostMutationResult> {
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    select: {
      authorId: true,
      publishedAt: true,
    },
  });

  if (!post) {
    throw new PostServiceError("게시글을 찾을 수 없습니다.", 404);
  }

  if (post.authorId !== ownerId) {
    throw new PostServiceError("게시글 작성자만 수정할 수 있습니다.", 403);
  }

  const folder = await resolvePostFolderId(ownerId, input.folderId);

  if (!folder.ok) {
    throw new PostServiceError(folder.error, 404);
  }

  const excerpt = await generatePostExcerpt(input, dependencies.generationClient);
  const [, updatedPost] = await prisma.$transaction([
    prisma.postTag.deleteMany({
      where: {
        postId,
      },
    }),
    prisma.post.update({
      where: {
        id: postId,
      },
      data: {
        title: input.title,
        excerpt,
        content: input.content,
        status: input.status,
        visibility: input.visibility,
        publishedAt: resolvePublishedAt(input.status, post.publishedAt),
        folderId: folder.folderId,
        tags: {
          create: toPostTagCreate(input.tagNames),
        },
      },
      include: postDetailInclude,
    }),
  ]);
  const aiPipeline = await syncPostVector(updatedPost, dependencies);

  return {
    aiPipeline,
    post: serializePost(updatedPost),
  };
}

export async function deleteOwnerPost(
  ownerId: string,
  postId: string,
  dependencies: PostServiceDependencies = {},
) {
  const post = await prisma.post.findUnique({
    where: {
      id: postId,
    },
    select: {
      authorId: true,
      id: true,
    },
  });

  if (!post) {
    throw new PostServiceError("게시글을 찾을 수 없습니다.", 404);
  }

  if (post.authorId !== ownerId) {
    throw new PostServiceError("게시글 작성자만 삭제할 수 있습니다.", 403);
  }

  const aiPipeline = await deletePostVector(post, dependencies);

  if (aiPipeline.status === "FAILED") {
    throw new PostServiceError(aiPipeline.message, 502);
  }

  await prisma.post.delete({
    where: {
      id: postId,
    },
  });

  return {
    aiPipeline,
    ok: true,
  };
}

export async function listOwnerPosts({
  limit = 10,
  ownerId,
  query,
  sort = "latest",
}: {
  limit?: number;
  ownerId: string;
  query?: string | null;
  sort?: PostListSort;
}) {
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 50);
  const where: Prisma.PostWhereInput = {
    authorId: ownerId,
  };

  Object.assign(where, createPostListFilterWhere({ query }));

  const posts = await prisma.post.findMany({
    where,
    include: postSummaryInclude,
    orderBy: {
      createdAt: sort === "oldest" ? "asc" : "desc",
    },
    take: safeLimit,
  });

  return posts.map(serializePost);
}

export async function listOwnerDraftPosts(ownerId: string) {
  const drafts = await prisma.post.findMany({
    where: {
      authorId: ownerId,
      status: "DRAFT",
    },
    include: postSummaryInclude,
    orderBy: {
      updatedAt: "desc",
    },
  });

  return drafts.map((draft) => {
    const serialized = serializePost(draft);

    return {
      content: serialized.content,
      createdAt: serialized.createdAt,
      excerpt: serialized.excerpt,
      folderId: serialized.folderId,
      id: serialized.id,
      status: serialized.status,
      tags: serialized.tags,
      title: serialized.title,
      updatedAt: serialized.updatedAt,
      visibility: serialized.visibility,
    } satisfies SerializedDraftPost;
  });
}

export async function getOwnerPost(ownerId: string, postId: string) {
  const post = await prisma.post.findFirst({
    where: {
      authorId: ownerId,
      id: postId,
    },
    include: postDetailInclude,
  });

  if (!post) {
    throw new PostServiceError("게시글을 찾을 수 없습니다.", 404);
  }

  return serializePost(post);
}
