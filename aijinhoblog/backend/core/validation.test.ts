import { describe, expect, it } from "vitest";

import {
  normalizeTags,
  normalizeUsername,
  parseCommentPayload,
  parseCredentials,
  parseFolderMergePayload,
  parseFolderMovePayload,
  parseFolderPayload,
  parsePositiveInt,
  parseProfilePayload,
  parsePostPayload,
  validateUsername,
} from "@/backend/core/validation";

describe("validation", () => {
  it("normalizes unique lowercase tags", () => {
    expect(normalizeTags([" AI ", "#Blog", "ai", "", "Next"])).toEqual(["ai", "blog", "next"]);
  });

  it("validates signup credentials", () => {
    expect(
      parseCredentials(
        { email: "USER@example.com", password: "12345678", name: "진호" },
        { requireName: true },
      ),
    ).toEqual({
      ok: true,
      value: {
        email: "user@example.com",
        password: "12345678",
        name: "진호",
        username: undefined,
      },
    });

    expect(
      parseCredentials({ email: "bad", password: "12345678", name: "진호" }, { requireName: true })
        .ok,
    ).toBe(false);
  });

  it("validates usernames", () => {
    expect(normalizeUsername(" Jinho-Blog ")).toBe("jinho-blog");
    expect(validateUsername("jinho-blog")).toBeNull();
    expect(validateUsername("ji")).toBeTruthy();
    expect(validateUsername("login")).toBeTruthy();
    expect(
      parseCredentials(
        {
          email: "USER@example.com",
          password: "12345678",
          name: "진호",
          username: "Jinho-Blog",
        },
        { requireName: true, requireUsername: true },
      ),
    ).toEqual({
      ok: true,
      value: {
        email: "user@example.com",
        password: "12345678",
        name: "진호",
        username: "jinho-blog",
      },
    });
  });

  it("validates post and comment payloads", () => {
    expect(
      parsePostPayload({
        title: "첫 글",
        content: "본문은 최소 길이를 넘겨야 합니다.",
        tags: "AI, blog, AI",
      }),
    ).toEqual({
      ok: true,
      value: {
        title: "첫 글",
        excerpt: null,
        content: "본문은 최소 길이를 넘겨야 합니다.",
        status: "PUBLISHED",
        visibility: "PUBLIC",
        folderId: null,
        tagNames: ["ai", "blog"],
      },
    });

    expect(
      parsePostPayload({
        title: "임시 글",
        content: "짧음",
        status: "DRAFT",
        visibility: "PRIVATE",
      }),
    ).toEqual({
      ok: true,
      value: {
        title: "임시 글",
        excerpt: null,
        content: "짧음",
        status: "DRAFT",
        visibility: "PRIVATE",
        folderId: null,
        tagNames: [],
      },
    });

    expect(parseCommentPayload({ content: "좋아요" }).ok).toBe(true);
    expect(parseCommentPayload({ content: " " }).ok).toBe(false);
  });

  it("parses bounded positive integers", () => {
    expect(parsePositiveInt("2", 1, { min: 1, max: 10 })).toBe(2);
    expect(parsePositiveInt("200", 1, { min: 1, max: 10 })).toBe(10);
    expect(parsePositiveInt("bad", 1, { min: 1, max: 10 })).toBe(1);
  });

  it("validates profile payloads", () => {
    expect(parseProfilePayload({ intro: "안녕하세요", blogTitle: "AiJinhoBlog" })).toEqual({
      ok: true,
      value: {
        intro: "안녕하세요",
        blogTitle: "AiJinhoBlog",
      },
    });

    expect(parseProfilePayload({ intro: "a".repeat(51) }).ok).toBe(false);
    expect(parseProfilePayload({ blogTitle: "" }).ok).toBe(false);
  });

  it("validates folder payloads", () => {
    expect(parseFolderPayload({ name: "기본 폴더" })).toEqual({
      ok: true,
      value: {
        name: "기본 폴더",
      },
    });
    expect(parseFolderPayload({ name: "" }).ok).toBe(false);
    expect(parseFolderMovePayload({ direction: "up" })).toEqual({
      ok: true,
      value: {
        direction: "up",
      },
    });
    expect(parseFolderMovePayload({ direction: "left" }).ok).toBe(false);
    expect(parseFolderMergePayload({ targetFolderId: "folder-2" })).toEqual({
      ok: true,
      value: {
        targetFolderId: "folder-2",
      },
    });
    expect(parseFolderMergePayload({}).ok).toBe(false);
  });
});
