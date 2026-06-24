import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveLocalUploadPath, validateImageUpload } from "@/backend/users/uploads";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00]);

function createFile(bytes: Uint8Array, name: string, type: string) {
  return new File([bytes], name, {
    type,
  });
}

describe("image uploads", () => {
  it("accepts an image when MIME, extension, and signature match", async () => {
    await expect(
      validateImageUpload(createFile(PNG_BYTES, "avatar.png", "image/png")),
    ).resolves.toMatchObject({
      extension: "png",
    });
  });

  it("rejects uploads when MIME and signature do not match", async () => {
    await expect(
      validateImageUpload(createFile(PNG_BYTES, "avatar.jpg", "image/jpeg")),
    ).rejects.toThrow("MIME type과 실제 이미지 형식이 일치하지 않습니다.");
  });

  it("rejects uploads when extension and signature do not match", async () => {
    await expect(
      validateImageUpload(createFile(JPEG_BYTES, "avatar.png", "image/jpeg")),
    ).rejects.toThrow("파일 확장자와 실제 이미지 형식이 일치하지 않습니다.");
  });

  it("rejects spoofed image content", async () => {
    await expect(
      validateImageUpload(
        createFile(new Uint8Array([0x68, 0x74, 0x6d, 0x6c]), "avatar.png", "image/png"),
      ),
    ).rejects.toThrow("실제 이미지 형식을 확인할 수 없습니다.");
  });

  it("resolves only local upload paths inside the upload root", () => {
    const resolved = resolveLocalUploadPath("/uploads/profile/avatar.png");

    expect(resolved).toContain(path.join("public", "uploads", "profile", "avatar.png"));
  });

  it("rejects traversal paths in local upload deletion", () => {
    expect(resolveLocalUploadPath("/uploads/../secret.txt")).toBeNull();
    expect(resolveLocalUploadPath("/uploads/profile/../../secret.txt")).toBeNull();
  });
});
