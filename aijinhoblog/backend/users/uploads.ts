import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const UPLOAD_ROOT = path.resolve(process.cwd(), "public", "uploads");
const IMAGE_TYPES = {
  jpeg: {
    extension: "jpg",
    extensions: ["jpg", "jpeg"],
    mime: "image/jpeg",
  },
  png: {
    extension: "png",
    extensions: ["png"],
    mime: "image/png",
  },
  webp: {
    extension: "webp",
    extensions: ["webp"],
    mime: "image/webp",
  },
} as const;

type ImageType = keyof typeof IMAGE_TYPES;

const MIME_TO_IMAGE_TYPE = new Map<string, ImageType>(
  Object.entries(IMAGE_TYPES).map(([type, config]) => [config.mime, type as ImageType]),
);

function detectImageType(buffer: Buffer): ImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

function readFileExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase().replace(/^\./, "");

  return extension || null;
}

function isInsideUploadRoot(filePath: string) {
  const relativePath = path.relative(UPLOAD_ROOT, filePath);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export async function validateImageUpload(file: File) {
  const expectedType = MIME_TO_IMAGE_TYPE.get(file.type);

  if (!expectedType) {
    throw new Error("jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다.");
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error("이미지는 5MB 이하만 업로드할 수 있습니다.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedType = detectImageType(buffer);

  if (!detectedType) {
    throw new Error("실제 이미지 형식을 확인할 수 없습니다.");
  }

  if (detectedType !== expectedType) {
    throw new Error("MIME type과 실제 이미지 형식이 일치하지 않습니다.");
  }

  const extension = readFileExtension(file.name);
  const detectedConfig = IMAGE_TYPES[detectedType];
  const allowedExtensions: readonly string[] = detectedConfig.extensions;

  if (extension && !allowedExtensions.includes(extension)) {
    throw new Error("파일 확장자와 실제 이미지 형식이 일치하지 않습니다.");
  }

  return {
    buffer,
    extension: detectedConfig.extension,
  };
}

export async function saveImageUpload(file: File, folder: "profile" | "cover") {
  const upload = await validateImageUpload(file);
  const directory = path.join(UPLOAD_ROOT, folder);
  const filename = `${randomUUID()}.${upload.extension}`;
  const filePath = path.join(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(filePath, upload.buffer);

  return `/uploads/${folder}/${filename}`;
}

export function resolveLocalUploadPath(url: string | null | undefined) {
  if (!url?.startsWith("/uploads/")) {
    return null;
  }

  const relativePath = url.replace(/^\/uploads\//, "");
  const filePath = path.resolve(UPLOAD_ROOT, relativePath);

  if (!isInsideUploadRoot(filePath)) {
    return null;
  }

  return filePath;
}

export async function deleteLocalUpload(url: string | null | undefined) {
  const filePath = resolveLocalUploadPath(url);

  if (!filePath) {
    return;
  }

  await unlink(filePath).catch(() => null);
}
