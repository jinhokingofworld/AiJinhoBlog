import { describe, expect, it } from "vitest";

import { verifySameOriginRequest } from "@/backend/security/csrf";

function createHeaders(values: Record<string, string> = {}) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(values)) {
    headers.set(key, value);
  }

  return headers;
}

describe("verifySameOriginRequest", () => {
  it("allows safe methods without origin headers", () => {
    expect(
      verifySameOriginRequest({
        headers: createHeaders(),
        method: "GET",
        url: "https://blog.example.com/api/posts",
      }),
    ).toEqual({
      ok: true,
      reason: null,
    });
  });

  it("allows unsafe methods when Origin matches request origin", () => {
    expect(
      verifySameOriginRequest({
        headers: createHeaders({
          origin: "https://blog.example.com",
        }),
        method: "POST",
        url: "https://blog.example.com/api/me/posts",
      }),
    ).toEqual({
      ok: true,
      reason: null,
    });
  });

  it("allows unsafe methods when Referer matches request origin", () => {
    expect(
      verifySameOriginRequest({
        headers: createHeaders({
          referer: "https://blog.example.com/jinho/posts/new",
        }),
        method: "PATCH",
        url: "https://blog.example.com/api/me/posts/post-1",
      }),
    ).toEqual({
      ok: true,
      reason: null,
    });
  });

  it("blocks unsafe methods from a different origin", () => {
    expect(
      verifySameOriginRequest({
        headers: createHeaders({
          origin: "https://attacker.example",
        }),
        method: "DELETE",
        url: "https://blog.example.com/api/me/posts/post-1",
      }),
    ).toEqual({
      ok: false,
      reason: "cross-origin",
    });
  });

  it("blocks unsafe methods when origin and referer are missing", () => {
    expect(
      verifySameOriginRequest({
        headers: createHeaders(),
        method: "POST",
        url: "https://blog.example.com/api/auth/logout",
      }),
    ).toEqual({
      ok: false,
      reason: "missing-origin",
    });
  });
});
