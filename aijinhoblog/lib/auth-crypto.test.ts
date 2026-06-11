import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "@/lib/auth-crypto";

describe("auth crypto", () => {
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
});
