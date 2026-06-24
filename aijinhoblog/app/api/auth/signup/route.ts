import { hashPassword } from "@/backend/auth/crypto";
import {
  enforceAuthRateLimit,
  readClientIp,
  toAuthRateLimitResponse,
} from "@/backend/auth/rate-limit";
import { fail, json, readJson } from "@/backend/core/http";
import { prisma } from "@/backend/core/prisma";
import { parseCredentials } from "@/backend/core/validation";
import { hashSecurityValue } from "@/backend/security/event-hash";
import { logSecurityEvent } from "@/backend/security/events";

export const runtime = "nodejs";

// POST /api/auth/signup
// 회원가입 페이지가 호출하는 API입니다. 입력 검증, 이메일/username 중복 확인, 비밀번호 hash 저장을 처리합니다.
export async function POST(request: Request) {
  const payload = await readJson(request);
  const parsed = parseCredentials(payload, { requireName: true, requireUsername: true });

  if (!parsed.ok) {
    logSecurityEvent({
      metadata: {
        reason: "validation_failed",
      },
      request,
      type: "auth.signup_failed",
    });

    return fail(parsed.error, 400);
  }

  try {
    await enforceAuthRateLimit({
      endpoint: "auth.signup",
      identifier: parsed.value.email,
      request,
    });
  } catch (error) {
    const rateLimit = toAuthRateLimitResponse(error);

    if (rateLimit) {
      logSecurityEvent({
        metadata: {
          clientIpHash: hashSecurityValue(readClientIp(request)),
          endpoint: "auth.signup",
          identifierHash: hashSecurityValue(parsed.value.email),
          reason: "rate_limit_exceeded",
        },
        request,
        type: "auth.rate_limited",
      });

      return fail(rateLimit.message, rateLimit.status);
    }

    throw error;
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: parsed.value.email }, { username: parsed.value.username }],
    },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  if (existingUser?.email === parsed.value.email) {
    logSecurityEvent({
      metadata: {
        emailHash: hashSecurityValue(parsed.value.email),
        reason: "duplicate_email",
      },
      request,
      type: "auth.signup_failed",
    });

    return fail("이미 가입된 이메일입니다.", 409);
  }

  if (existingUser?.username === parsed.value.username) {
    logSecurityEvent({
      metadata: {
        emailHash: hashSecurityValue(parsed.value.email),
        reason: "duplicate_username",
      },
      request,
      type: "auth.signup_failed",
    });

    return fail("이미 사용 중인 username입니다.", 409);
  }

  // 실전 구현 포인트: 비밀번호 원문은 저장하지 않고 hashPassword 결과만 저장합니다.
  const user = await prisma.user.create({
    data: {
      email: parsed.value.email,
      username: parsed.value.username ?? parsed.value.email.split("@")[0],
      name: parsed.value.name ?? parsed.value.email.split("@")[0],
      passwordHash: hashPassword(parsed.value.password),
    },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
    },
  });

  return json({ user }, 201);
}
