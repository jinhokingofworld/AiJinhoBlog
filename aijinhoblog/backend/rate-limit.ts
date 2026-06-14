import type { PrismaClient } from "@/backend/generated/prisma";

import { prisma as defaultPrisma } from "@/backend/prisma";

const DEFAULT_AI_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_AI_RATE_LIMIT_REQUESTS = 20;

type RateLimitPrisma = Pick<PrismaClient, "aiRateLimitBucket">;

export class RateLimitExceededError extends Error {
  limit: number;
  retryAfterSeconds: number;
  windowMs: number;

  constructor({
    limit,
    retryAfterSeconds,
    windowMs,
  }: {
    limit: number;
    retryAfterSeconds: number;
    windowMs: number;
  }) {
    super(`AI 요청 한도를 초과했습니다. ${retryAfterSeconds}초 후 다시 시도해주세요.`);
    this.name = "RateLimitExceededError";
    this.limit = limit;
    this.retryAfterSeconds = retryAfterSeconds;
    this.windowMs = windowMs;
  }
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getWindowMs() {
  return readPositiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, DEFAULT_AI_RATE_LIMIT_WINDOW_MS);
}

function getLimit() {
  return readPositiveInt(process.env.AI_RATE_LIMIT_REQUESTS, DEFAULT_AI_RATE_LIMIT_REQUESTS);
}

function getWindowStart(nowMs: number, windowMs: number) {
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

function getRetryAfterSeconds(nowMs: number, windowMs: number) {
  const nextWindowMs = Math.floor(nowMs / windowMs) * windowMs + windowMs;

  return Math.max(1, Math.ceil((nextWindowMs - nowMs) / 1000));
}

export async function enforceAiRateLimit({
  endpoint,
  limit = getLimit(),
  now = new Date(),
  prisma = defaultPrisma,
  userId,
  windowMs = getWindowMs(),
}: {
  endpoint: string;
  limit?: number;
  now?: Date;
  prisma?: RateLimitPrisma;
  userId: string;
  windowMs?: number;
}) {
  const nowMs = now.getTime();
  const bucket = await prisma.aiRateLimitBucket.upsert({
    where: {
      userId_endpoint_windowStart: {
        endpoint,
        userId,
        windowStart: getWindowStart(nowMs, windowMs),
      },
    },
    create: {
      endpoint,
      requestCount: 1,
      userId,
      windowStart: getWindowStart(nowMs, windowMs),
    },
    update: {
      requestCount: {
        increment: 1,
      },
    },
  });

  if (bucket.requestCount > limit) {
    throw new RateLimitExceededError({
      limit,
      retryAfterSeconds: getRetryAfterSeconds(nowMs, windowMs),
      windowMs,
    });
  }

  return {
    limit,
    remaining: Math.max(0, limit - bucket.requestCount),
    requestCount: bucket.requestCount,
    windowMs,
    windowStart: bucket.windowStart,
  };
}

export function toRateLimitResponse(error: unknown) {
  if (error instanceof RateLimitExceededError) {
    return {
      message: error.message,
      status: 429,
    };
  }

  return null;
}
