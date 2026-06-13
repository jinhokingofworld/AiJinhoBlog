import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const MIME_TO_EXTENSION = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function saveImageUpload(file: File, folder: "profile" | "cover") {
  const extension = MIME_TO_EXTENSION.get(file.type);

  if (!extension) {
    throw new Error("jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다.");
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("이미지는 5MB 이하만 업로드할 수 있습니다.");
  }

  const directory = path.join(UPLOAD_ROOT, folder);
  const filename = `${randomUUID()}.${extension}`;
  const filePath = path.join(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

  return `/uploads/${folder}/${filename}`;
}

export async function deleteLocalUpload(url: string | null | undefined) {
  if (!url?.startsWith("/uploads/")) {
    return;
  }

  const relativePath = url.replace(/^\/uploads\//, "");
  const filePath = path.join(UPLOAD_ROOT, relativePath);

  if (!filePath.startsWith(UPLOAD_ROOT)) {
    return;
  }

  await unlink(filePath).catch(() => null);
}
