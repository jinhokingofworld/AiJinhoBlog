import { getCurrentUser } from "@/backend/auth";
import { fail, json } from "@/backend/http";
import { profileSelect, serializeProfile } from "@/backend/profile";
import { prisma } from "@/backend/prisma";
import { deleteLocalUpload, saveImageUpload } from "@/backend/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return fail("이미지 파일이 필요합니다.", 400);
  }

  const current = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      profileImageUrl: true,
    },
  });

  try {
    const imageUrl = await saveImageUpload(file, "profile");
    const updated = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        profileImageUrl: imageUrl,
      },
      select: profileSelect,
    });

    await deleteLocalUpload(current?.profileImageUrl);

    return json({ imageUrl, profile: serializeProfile(updated) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "이미지 업로드 실패", 400);
  }
}
