import { getCurrentUser } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { profileSelect, serializeProfile } from "@/lib/profile";
import { prisma } from "@/lib/prisma";
import { deleteLocalUpload, saveImageUpload } from "@/lib/uploads";

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
      coverImageUrl: true,
    },
  });

  try {
    const imageUrl = await saveImageUpload(file, "cover");
    const updated = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        coverImageUrl: imageUrl,
      },
      select: profileSelect,
    });

    await deleteLocalUpload(current?.coverImageUrl);

    return json({ imageUrl, profile: serializeProfile(updated) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "이미지 업로드 실패", 400);
  }
}
