import { describe, expect, it } from "vitest";

import {
  canReadPost,
  createPageWindow,
  createPostListFilterWhere,
  createPostSummary,
  normalizePostSearchQuery,
  normalizePostSort,
  normalizePostTagFilter,
  POST_PAGE_SIZE,
  resolvePublishedAt,
} from "@/lib/posts";

describe("posts", () => {
  it("creates a fallback summary without calling AI features", () => {
    expect(createPostSummary("직접 작성한 요약", "본문")).toBe("직접 작성한 요약");
    expect(createPostSummary(null, "첫 줄\n\n두 번째 줄", 20)).toBe("첫 줄 두 번째 줄");
    expect(createPostSummary(null, "a".repeat(130), 12)).toBe("aaaaaaaaa...");
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

  it("creates title and excerpt search filters", () => {
    expect(createPostListFilterWhere({ query: "AI", tag: "blog" })).toEqual({
      OR: [{ title: { contains: "AI" } }, { excerpt: { contains: "AI" } }],
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
      OR: [{ title: { contains: "AI" } }, { excerpt: { contains: "AI" } }],
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
});
