import { createHash } from "node:crypto";

export function hashSecurityValue(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
