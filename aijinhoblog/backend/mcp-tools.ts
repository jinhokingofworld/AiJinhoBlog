import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  createDraftFromImage,
  createDraftFromLink,
  ContentDraftError,
} from "@/backend/content-drafts";
import {
  createOwnerPost,
  deleteOwnerPost,
  getOwnerPost,
  listOwnerPosts,
  PostServiceError,
  updateOwnerPost,
} from "@/backend/posts";
import { prisma } from "@/backend/prisma";
import { normalizeTags, parsePostPayload } from "@/backend/validation";

const ownerSchema = {
  ownerEmail: z.string().email().optional(),
  ownerId: z.string().min(1).optional(),
  ownerUsername: z.string().min(1).optional(),
};

const postPayloadSchema = {
  content: z.string().default(""),
  excerpt: z.string().optional(),
  folderId: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  tags: z.array(z.string()).default([]),
  title: z.string().min(2).max(160),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PRIVATE"),
};

type OwnerInput = {
  ownerEmail?: string;
  ownerId?: string;
  ownerUsername?: string;
};

function toToolText(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toToolError(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : "MCP tool 실행에 실패했습니다.",
      },
    ],
    isError: true,
  };
}

function createPostInput(input: {
  content: string;
  excerpt?: string;
  folderId?: string;
  status: "DRAFT" | "PUBLISHED";
  tags: string[];
  title: string;
  visibility: "PUBLIC" | "PRIVATE";
}) {
  const parsed = parsePostPayload({
    content: input.content,
    excerpt: input.excerpt ?? "",
    folderId: input.folderId ?? "",
    status: input.status,
    tags: input.tags,
    title: input.title,
    visibility: input.visibility,
  });

  if (!parsed.ok) {
    throw new PostServiceError(parsed.error, 400);
  }

  return parsed.value;
}

export function createMcpOwnerWhere(input: OwnerInput = {}) {
  const ownerId = input.ownerId ?? process.env.AIJINHOBLOG_MCP_OWNER_ID;
  const ownerUsername = input.ownerUsername ?? process.env.AIJINHOBLOG_MCP_OWNER_USERNAME;
  const ownerEmail = input.ownerEmail ?? process.env.AIJINHOBLOG_MCP_OWNER_EMAIL;

  if (!ownerId && !ownerUsername && !ownerEmail) {
    return null;
  }

  return {
    ...(ownerId ? { id: ownerId } : {}),
    ...(ownerUsername ? { username: ownerUsername } : {}),
    ...(ownerEmail ? { email: ownerEmail } : {}),
  };
}

export async function resolveMcpOwner(input: OwnerInput = {}) {
  const where = createMcpOwnerWhere(input);

  if (!where) {
    throw new PostServiceError(
      "MCP owner 식별자가 필요합니다. ownerUsername, ownerEmail, ownerId 또는 AIJINHOBLOG_MCP_OWNER_* 환경 변수를 설정해주세요.",
      400,
    );
  }

  const user = await prisma.user.findFirst({
    where,
    select: {
      email: true,
      id: true,
      username: true,
    },
  });

  if (!user) {
    throw new PostServiceError(
      "MCP owner를 찾을 수 없습니다. ownerUsername, ownerEmail, ownerId 또는 AIJINHOBLOG_MCP_OWNER_* 환경 변수를 설정해주세요.",
      404,
    );
  }

  return user;
}

export function registerBlogMcpTools(server: McpServer) {
  server.registerTool(
    "blog_list_posts",
    {
      description: "소유자의 게시글 목록을 조회합니다.",
      inputSchema: {
        ...ownerSchema,
        limit: z.number().int().min(1).max(50).default(10),
        query: z.string().optional(),
        sort: z.enum(["latest", "oldest"]).default("latest"),
      },
      title: "Blog List Posts",
    },
    async (input) => {
      try {
        const owner = await resolveMcpOwner(input);
        const posts = await listOwnerPosts({
          limit: input.limit,
          ownerId: owner.id,
          query: input.query,
          sort: input.sort,
        });

        return toToolText({ owner, posts });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "blog_get_post",
    {
      description: "소유자의 게시글 상세를 조회합니다.",
      inputSchema: {
        ...ownerSchema,
        postId: z.string().min(1),
      },
      title: "Blog Get Post",
    },
    async (input) => {
      try {
        const owner = await resolveMcpOwner(input);
        const post = await getOwnerPost(owner.id, input.postId);

        return toToolText({ owner, post });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "blog_create_post",
    {
      description: "소유자의 게시글을 생성합니다. 기본값은 비공개 임시저장입니다.",
      inputSchema: {
        ...ownerSchema,
        ...postPayloadSchema,
      },
      title: "Blog Create Post",
    },
    async (input) => {
      try {
        const owner = await resolveMcpOwner(input);
        const post = await createOwnerPost(owner.id, createPostInput(input));

        return toToolText({ owner, post });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "blog_update_post",
    {
      description: "소유자의 게시글을 수정합니다.",
      inputSchema: {
        ...ownerSchema,
        ...postPayloadSchema,
        postId: z.string().min(1),
      },
      title: "Blog Update Post",
    },
    async (input) => {
      try {
        const owner = await resolveMcpOwner(input);
        const post = await updateOwnerPost(owner.id, input.postId, createPostInput(input));

        return toToolText({ owner, post });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "blog_delete_post",
    {
      description: "소유자의 게시글을 삭제합니다.",
      inputSchema: {
        ...ownerSchema,
        postId: z.string().min(1),
      },
      title: "Blog Delete Post",
    },
    async (input) => {
      try {
        const owner = await resolveMcpOwner(input);
        const result = await deleteOwnerPost(owner.id, input.postId);

        return toToolText({ owner, result });
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "blog_create_draft_from_link",
    {
      description: "외부 링크를 분석하고 비공개 임시저장 게시글 초안으로 저장합니다.",
      inputSchema: {
        ...ownerSchema,
        folderId: z.string().optional(),
        tags: z.array(z.string()).default([]),
        title: z.string().optional(),
        url: z.string().url(),
      },
      title: "Blog Create Draft From Link",
    },
    async (input) => {
      try {
        const owner = await resolveMcpOwner(input);
        const post = await createDraftFromLink({
          options: {
            folderId: input.folderId,
            tagNames: normalizeTags(input.tags),
            title: input.title,
          },
          ownerId: owner.id,
          url: input.url,
        });

        return toToolText({ owner, post });
      } catch (error) {
        return toToolError(error instanceof ContentDraftError ? error : error);
      }
    },
  );

  server.registerTool(
    "blog_create_draft_from_image",
    {
      description: "이미지 URL을 분석하고 비공개 임시저장 게시글 초안으로 저장합니다.",
      inputSchema: {
        ...ownerSchema,
        folderId: z.string().optional(),
        imageUrl: z.string().url(),
        prompt: z.string().optional(),
        tags: z.array(z.string()).default([]),
        title: z.string().optional(),
      },
      title: "Blog Create Draft From Image",
    },
    async (input) => {
      try {
        const owner = await resolveMcpOwner(input);
        const post = await createDraftFromImage({
          imageUrl: input.imageUrl,
          options: {
            folderId: input.folderId,
            tagNames: normalizeTags(input.tags),
            title: input.title,
          },
          ownerId: owner.id,
          prompt: input.prompt,
        });

        return toToolText({ owner, post });
      } catch (error) {
        return toToolError(error instanceof ContentDraftError ? error : error);
      }
    },
  );
}
