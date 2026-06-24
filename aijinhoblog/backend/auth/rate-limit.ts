import { createHash } from "node:crypto";

import { prisma as defaultPrisma } from "@/backend/core/prisma";

const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const DEFAULT_AUTH_RATE_LIMIT_REQUESTS = 10;

type AuthRateLimitPrisma = {
  authRateLimitBucket: {
    upsert(args: {
      create: {
        endpoint: string;
        identifierHash: string;
        ipHash: string;
        requestCount: number;
        windowStart: Date;
      };
      update: {
        requestCount: {
          increment: number;
        };
      };
      where: {
        endpoint_ipHash_identifierHash_windowStart: {
          endpoint: string;
          identifierHash: string;
          ipHash: string;
          windowStart: Date;
        };
      };
    }): Promise<{
      requestCount: number;
      windowStart: Date;
    }>;
  };
};

export class AuthRateLimitExceededError extends Error {
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
    super(`인증 요청 한도를 초과했습니다. ${retryAfterSeconds}초 후 다시 시도해주세요.`);
    this.name = "AuthRateLimitExceededError";
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
  return readPositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS);
}

function getLimit() {
  return readPositiveInt(process.env.AUTH_RATE_LIMIT_REQUESTS, DEFAULT_AUTH_RATE_LIMIT_REQUESTS);
}

function getWindowStart(nowMs: number, windowMs: number) {
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

function getRetryAfterSeconds(nowMs: number, windowMs: number) {
  const nextWindowMs = Math.floor(nowMs / windowMs) * windowMs + windowMs;

  return Math.max(1, Math.ceil((nextWindowMs - nowMs) / 1000));
}

function hashBucketKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function readClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function enforceAuthRateLimit({
  endpoint,
  identifier,
  limit = getLimit(),
  now = new Date(),
  prisma = defaultPrisma,
  request,
  windowMs = getWindowMs(),
}: {
  endpoint: string;
  identifier: string;
  limit?: number;
  now?: Date;
  prisma?: AuthRateLimitPrisma;
  request: Request;
  windowMs?: number;
}) {
  const nowMs = now.getTime();
  const windowStart = getWindowStart(nowMs, windowMs);
  const ipHash = hashBucketKey(readClientIp(request));
  const identifierHash = hashBucketKey(identifier.trim().toLowerCase() || "anonymous");
  const bucket = await prisma.authRateLimitBucket.upsert({
    where: {
      endpoint_ipHash_identifierHash_windowStart: {
        endpoint,
        identifierHash,
        ipHash,
        windowStart,
      },
    },
    create: {
      endpoint,
      identifierHash,
      ipHash,
      requestCount: 1,
      windowStart,
    },
    update: {
      requestCount: {
        increment: 1,
      },
    },
  });

  if (bucket.requestCount > limit) {
    throw new AuthRateLimitExceededError({
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

export function toAuthRateLimitResponse(error: unknown) {
  if (error instanceof AuthRateLimitExceededError) {
    return {
      message: error.message,
      status: 429,
    };
  }

  return null;
}
