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
