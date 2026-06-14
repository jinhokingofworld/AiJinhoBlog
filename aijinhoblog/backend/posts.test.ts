import { describe, expect, it } from "vitest";

import {
  canReadPost,
  createFallbackPostExcerpt,
  createPageWindow,
  createPostListFilterWhere,
  createPostSummary,
  generatePostExcerpt,
  normalizePostSearchQuery,
  normalizePostSort,
  normalizePostTagFilter,
  POST_PAGE_SIZE,
  postDetailInclude,
  postSummaryInclude,
  resolvePublishedAt,
  sanitizeGeneratedExcerpt,
} from "@/backend/posts";

describe("posts", () => {
  it("creates a fallback summary without calling AI features", () => {
    expect(createPostSummary("직접 작성한 요약", "본문")).toBe("직접 작성한 요약");
    expect(createPostSummary(null, "첫 줄\n\n두 번째 줄", 20)).toBe("첫 줄 두 번째 줄");
    expect(createPostSummary(null, "a".repeat(130), 12)).toBe("aaaaaaaaa...");
  });

  it("sanitizes generated excerpts into plain text", () => {
    expect(sanitizeGeneratedExcerpt("## 제목\n- **핵심** 내용을 요약합니다.")).toBe(
      "제목 핵심 내용을 요약합니다.",
    );
  });

  it("generates post excerpts with an AI client and falls back on provider failures", async () => {
    const generationClient = {
      generateAnswer: async () => ({
        model: "test",
        text: "- AI가 작성한 요약입니다.",
        usage: {
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
        },
      }),
    };
    const excerpt = await generatePostExcerpt(
      {
        content: "본문 내용입니다. 저장할 때 AI가 요약을 작성합니다.",
        title: "AI 요약",
      },
      generationClient,
    );

    expect(excerpt).toBe("AI가 작성한 요약입니다.");

    const fallback = createFallbackPostExcerpt({
      content: "AI 호출이 실패해도 본문 기반 요약은 남습니다.",
      title: "fallback",
    });

    expect(fallback).toBe("AI 호출이 실패해도 본문 기반 요약은 남습니다.");
  });

  it("normalizes list sort options", () => {
    expect(normalizePostSort("oldest")).toBe("oldest");
    expect(normalizePostSort("latest")).toBe("latest");
    expect(normalizePostSort("bad")).toBe("latest");
  });

  it("normalizes keyword and tag filters", () => {
    expect(normalizePostSearchQuery("  검색어  ")).toBe("검색어");
    expect(normalizePostSearchQuery("   ")).toBeNull();
    expect(normalizePostTagFilter(" #AI ")).toBe("ai");
    expect(normalizePostTagFilter("")).toBeNull();
  });

  it("creates title, excerpt, and content search filters", () => {
    expect(createPostListFilterWhere({ query: "AI", tag: "blog" })).toEqual({
      OR: [
        { title: { contains: "AI" } },
        { excerpt: { contains: "AI" } },
        { content: { contains: "AI" } },
      ],
      tags: {
        some: {
          tag: {
            name: "blog",
          },
        },
      },
    });
  });

  it("creates tag filters from hashtag search queries", () => {
    expect(createPostListFilterWhere({ query: "#blog" })).toEqual({
      tags: {
        some: {
          tag: {
            name: "blog",
          },
        },
      },
    });

    expect(createPostListFilterWhere({ query: "AI #blog" })).toEqual({
      OR: [
        { title: { contains: "AI" } },
        { excerpt: { contains: "AI" } },
        { content: { contains: "AI" } },
      ],
      tags: {
        some: {
          tag: {
            name: "blog",
          },
        },
      },
    });
  });

  it("uses five posts as the default list page size", () => {
    expect(POST_PAGE_SIZE).toBe(5);
  });

  it("creates a three-page pagination window", () => {
    expect(createPageWindow(1, 10)).toEqual([1, 2, 3]);
    expect(createPageWindow(4, 10)).toEqual([3, 4, 5]);
    expect(createPageWindow(10, 10)).toEqual([8, 9, 10]);
    expect(createPageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it("allows owners to read drafts and private posts", () => {
    expect(
      canReadPost(
        {
          authorId: "owner",
          status: "DRAFT",
          visibility: "PRIVATE",
        },
        "owner",
      ),
    ).toBe(true);
  });

  it("allows guests to read only public published posts", () => {
    expect(
      canReadPost({
        authorId: "owner",
        status: "PUBLISHED",
        visibility: "PUBLIC",
      }),
    ).toBe(true);
    expect(
      canReadPost({
        authorId: "owner",
        status: "PUBLISHED",
        visibility: "PRIVATE",
      }),
    ).toBe(false);
    expect(
      canReadPost({
        authorId: "owner",
        status: "DRAFT",
        visibility: "PUBLIC",
      }),
    ).toBe(false);
  });

  it("resolves publishedAt from post status", () => {
    const current = new Date("2026-06-12T10:00:00.000Z");
    const next = new Date("2026-06-12T11:00:00.000Z");

    expect(resolvePublishedAt("PUBLISHED", current, next)).toBe(current);
    expect(resolvePublishedAt("PUBLISHED", null, next)).toBe(next);
    expect(resolvePublishedAt("DRAFT", current, next)).toBeNull();
  });

  it("does not include author email in public post selections", () => {
    expect(postSummaryInclude.author.select).toEqual({
      id: true,
      username: true,
      name: true,
    });
    expect(postDetailInclude.comments.include.author.select).toEqual({
      id: true,
      username: true,
      name: true,
    });
  });
});
