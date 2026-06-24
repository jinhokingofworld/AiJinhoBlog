import { describe, expect, it, vi } from "vitest";

import {
  AuthRateLimitExceededError,
  enforceAuthRateLimit,
  readClientIp,
} from "@/backend/auth/rate-limit";

function createRequest(headers: Record<string, string> = {}) {
  return new Request("https://blog.example.com/api/auth/login", {
    headers,
    method: "POST",
  });
}

function createPrismaMock() {
  const buckets = new Map<string, { requestCount: number; windowStart: Date }>();

  return {
    buckets,
    prisma: {
      authRateLimitBucket: {
        upsert: vi.fn(({ create, update, where }) => {
          const key = [
            where.endpoint_ipHash_identifierHash_windowStart.endpoint,
            where.endpoint_ipHash_identifierHash_windowStart.ipHash,
            where.endpoint_ipHash_identifierHash_windowStart.identifierHash,
            where.endpoint_ipHash_identifierHash_windowStart.windowStart.toISOString(),
          ].join(":");
          const existing = buckets.get(key);
          const next = existing
            ? {
                ...existing,
                requestCount: existing.requestCount + update.requestCount.increment,
              }
            : {
                requestCount: create.requestCount,
                windowStart: create.windowStart,
              };

          buckets.set(key, next);

          return Promise.resolve(next);
        }),
      },
    },
  };
}

describe("auth rate limit", () => {
  it("reads the first forwarded client IP", () => {
    expect(readClientIp(createRequest({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" }))).toBe(
      "203.0.113.10",
    );
  });

  it("increments an IP and identifier bucket", async () => {
    const { prisma } = createPrismaMock();
    const request = createRequest({ "x-forwarded-for": "203.0.113.10" });
    const first = await enforceAuthRateLimit({
      endpoint: "auth.login",
      identifier: "USER@example.com",
      limit: 2,
      now: new Date("2026-06-25T00:00:01.000Z"),
      prisma,
      request,
      windowMs: 60_000,
    });
    const second = await enforceAuthRateLimit({
      endpoint: "auth.login",
      identifier: " user@example.com ",
      limit: 2,
      now: new Date("2026-06-25T00:00:02.000Z"),
      prisma,
      request,
      windowMs: 60_000,
    });

    expect(first.remaining).toBe(1);
    expect(second.remaining).toBe(0);
  });

  it("throws after the configured limit", async () => {
    const { prisma } = createPrismaMock();
    const options = {
      endpoint: "auth.signup",
      identifier: "new-user@example.com",
      limit: 1,
      now: new Date("2026-06-25T00:01:10.000Z"),
      prisma,
      request: createRequest({ "x-real-ip": "198.51.100.20" }),
      windowMs: 60_000,
    };

    await enforceAuthRateLimit(options);

    await expect(enforceAuthRateLimit(options)).rejects.toBeInstanceOf(AuthRateLimitExceededError);
  });

  it("uses separate buckets for different identifiers", async () => {
    const { buckets, prisma } = createPrismaMock();
    const request = createRequest({ "x-real-ip": "198.51.100.20" });

    await enforceAuthRateLimit({
      endpoint: "auth.login",
      identifier: "first@example.com",
      limit: 1,
      now: new Date("2026-06-25T00:02:10.000Z"),
      prisma,
      request,
      windowMs: 60_000,
    });
    await enforceAuthRateLimit({
      endpoint: "auth.login",
      identifier: "second@example.com",
      limit: 1,
      now: new Date("2026-06-25T00:02:11.000Z"),
      prisma,
      request,
      windowMs: 60_000,
    });

    expect(buckets.size).toBe(2);
  });
});
