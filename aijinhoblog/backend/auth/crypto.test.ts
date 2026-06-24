import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createJwt,
  createSessionToken,
  getJwtSecret,
  hashPassword,
  hashSessionToken,
  verifyJwt,
  verifyPassword,
} from "@/backend/auth/crypto";

describe("auth crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hashes and verifies passwords", () => {
    const hash = hashPassword("correct-password");

    expect(hash).not.toContain("correct-password");
    expect(verifyPassword("correct-password", hash)).toBe(true);
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("creates non-empty session tokens and deterministic token hashes", () => {
    const token = createSessionToken();
    const hash = hashSessionToken(token);

    expect(token.length).toBeGreaterThan(20);
    expect(hash).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hash);
  });

  it("signs and verifies JWT payloads", () => {
    const token = createJwt({ sub: "user-1", type: "access" }, new Date(Date.now() + 60_000));
    const payload = verifyJwt(token);

    expect(payload?.sub).toBe("user-1");
    expect(payload?.type).toBe("access");
  });

  it("allows the development JWT fallback outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_JWT_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");

    expect(getJwtSecret()).toBe("aijinhoblog-development-secret-change-me");
  });

  it("rejects missing production JWT secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_JWT_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");

    expect(() => getJwtSecret()).toThrow(/production/);
  });

  it("rejects short production JWT secrets", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_JWT_SECRET", "short-secret");
    vi.stubEnv("NEXTAUTH_SECRET", "");

    expect(() => getJwtSecret()).toThrow(/32자/);
  });

  it("accepts a strong production JWT secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_JWT_SECRET", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("NEXTAUTH_SECRET", "");

    expect(getJwtSecret()).toBe("0123456789abcdef0123456789abcdef");
  });
});
