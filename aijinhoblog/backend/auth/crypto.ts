import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const JWT_ALGORITHM = "HS256";
const JWT_TYPE = "JWT";

type JwtPayload = Record<string, unknown> & {
  exp?: number;
  iat?: number;
};

function getJwtSecret() {
  return (
    process.env.AUTH_JWT_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "aijinhoblog-development-secret-change-me"
  );
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as JwtPayload;
}

function signData(data: string) {
  return createHmac("sha256", getJwtSecret()).update(data).digest("base64url");
}

// 실전 구현 포인트: 비밀번호는 복호화할 수 있게 저장하지 않고 salt + PBKDF2 hash로만 저장합니다.
// 로그인 시에도 같은 salt/iteration으로 후보 hash를 만든 뒤 timingSafeEqual로 비교합니다.
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  ).toString("base64url");

  return `${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [iterationsValue, salt, hash] = storedHash.split(":");
  const iterations = Number(iterationsValue);

  if (!iterations || !salt || !hash) {
    return false;
  }

  const candidate = pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);
  const expected = Buffer.from(hash, "base64url");

  if (candidate.byteLength !== expected.byteLength) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// 실전 구현 포인트: 이 프로젝트의 access/refresh token은 직접 만든 HS256 JWT입니다.
// payload에는 sub(userId), type(access/refresh), exp 만료 시간이 들어가고 쿠키에 실려 이동합니다.
export function createJwt(payload: Record<string, unknown>, expiresAt: Date) {
  const header = encodeJson({
    alg: JWT_ALGORITHM,
    typ: JWT_TYPE,
  });
  const body = encodeJson({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  const data = `${header}.${body}`;

  return `${data}.${signData(data)}`;
}

// JWT 검증 흐름입니다.
// 1) header.body.signature 3조각인지 확인
// 2) 서버 secret으로 서명을 다시 계산해 비교
// 3) alg/typ/exp를 확인한 뒤 payload를 반환합니다.
export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, body, signature] = parts;
  const data = `${header}.${body}`;
  const expected = signData(data);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (
    expectedBuffer.byteLength !== signatureBuffer.byteLength ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const decodedHeader = decodeJson(header);
    const decodedBody = decodeJson(body);

    if (decodedHeader.alg !== JWT_ALGORITHM || decodedHeader.typ !== JWT_TYPE) {
      return null;
    }

    if (typeof decodedBody.exp !== "number" || decodedBody.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decodedBody;
  } catch {
    return null;
  }
}
