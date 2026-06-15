import { describe, expect, it } from "vitest";

import { serializeProfile } from "@/backend/users/profile";

describe("profile", () => {
  it("does not expose user email through profile serialization", () => {
    const user = {
      id: "user-1",
      email: "private@example.com",
      username: "jinho",
      name: "진호",
      intro: null,
      blogTitle: "AiJinhoBlog",
      profileImageUrl: null,
      coverImageUrl: null,
    };

    expect(serializeProfile(user)).toEqual({
      id: "user-1",
      username: "jinho",
      name: "진호",
      intro: "안녕하세요 jinho입니다.",
      blogTitle: "AiJinhoBlog",
      profileImageUrl: "/default-profile.svg",
      coverImageUrl: "/default-cover.svg",
    });
  });
});
