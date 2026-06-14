import { describe, expect, it, vi } from "vitest";

import { RateLimitExceededError, enforceAiRateLimit } from "@/backend/rate-limit";

function createPrismaMock() {
  const buckets = new Map<string, { requestCount: number; windowStart: Date }>();

  return {
    buckets,
    prisma: {
      aiRateLimitBucket: {
        upsert: vi.fn(({ create, update, where }) => {
          const key = [
            where.userId_endpoint_windowStart.userId,
            where.userId_endpoint_windowStart.endpoint,
            where.userId_endpoint_windowStart.windowStart.toISOString(),
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

describe("enforceAiRateLimit", () => {
  it("increments a user endpoint bucket and allows requests under the limit", async () => {
    const { prisma } = createPrismaMock();
    const first = await enforceAiRateLimit({
      endpoint: "rag.answer",
      limit: 2,
      now: new Date("2026-06-14T00:00:01.000Z"),
      prisma: prisma as never,
      userId: "user-1",
      windowMs: 60_000,
    });
    const second = await enforceAiRateLimit({
      endpoint: "rag.answer",
      limit: 2,
      now: new Date("2026-06-14T00:00:02.000Z"),
      prisma: prisma as never,
      userId: "user-1",
      windowMs: 60_000,
    });

    expect(first.remaining).toBe(1);
    expect(second.remaining).toBe(0);
  });

  it("throws a 429-style error after the configured limit", async () => {
    const { prisma } = createPrismaMock();
    const options = {
      endpoint: "agent.rewrite",
      limit: 1,
      now: new Date("2026-06-14T00:00:10.000Z"),
      prisma: prisma as never,
      userId: "user-1",
      windowMs: 60_000,
    };

    await enforceAiRateLimit(options);

    await expect(enforceAiRateLimit(options)).rejects.toBeInstanceOf(RateLimitExceededError);
  });
});
