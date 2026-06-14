import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import "@/backend/env";

const TOKEN_CIPHER_VERSION = "v1";

export class ExternalConnectionTokenError extends Error {
  constructor(message = "외부 연결 토큰을 읽지 못했습니다.") {
    super(message);
    this.name = "ExternalConnectionTokenError";
  }
}

function getEncryptionSecret() {
  const secret =
    process.env.EXTERNAL_CONNECTION_ENCRYPTION_KEY ??
    process.env.AUTH_JWT_SECRET ??
    process.env.NEXTAUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new ExternalConnectionTokenError("EXTERNAL_CONNECTION_ENCRYPTION_KEY 설정이 필요합니다.");
  }

  return "aijinhoblog-development-external-token-secret";
}

function getEncryptionKey() {
  return createHash("sha256").update(getEncryptionSecret()).digest();
}

function parseCiphertext(ciphertext: string) {
  const [version, iv, tag, encrypted] = ciphertext.split(":");

  if (version !== TOKEN_CIPHER_VERSION || !iv || !tag || !encrypted) {
    throw new ExternalConnectionTokenError();
  }

  return {
    encrypted: Buffer.from(encrypted, "base64url"),
    iv: Buffer.from(iv, "base64url"),
    tag: Buffer.from(tag, "base64url"),
  };
}

export function encryptExternalToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_CIPHER_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptExternalToken(ciphertext: string) {
  const parsed = parseCiphertext(ciphertext);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), parsed.iv);

  decipher.setAuthTag(parsed.tag);

  return Buffer.concat([decipher.update(parsed.encrypted), decipher.final()]).toString("utf8");
}
