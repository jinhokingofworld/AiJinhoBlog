import { describe, expect, it } from "vitest";

import { canReadPost, createPostSummary, normalizePostSort, resolvePublishedAt } from "@/lib/posts";

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
