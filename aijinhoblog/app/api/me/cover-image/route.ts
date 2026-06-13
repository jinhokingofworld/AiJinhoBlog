import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import { fail, json } from "@/backend/http";
import { profileSelect, serializeProfile } from "@/backend/profile";
import { prisma } from "@/backend/prisma";
import { deleteLocalUpload, saveImageUpload } from "@/backend/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return failWithRefreshedSession("이미지 파일이 필요합니다.", auth, 400);
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

    const response = json({ imageUrl, profile: serializeProfile(updated) });

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    return failWithRefreshedSession(
      error instanceof Error ? error.message : "이미지 업로드 실패",
      auth,
      400,
    );
  }
}
