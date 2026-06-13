import { fail, json } from "@/backend/http";
import { profileSelect, serializeProfile } from "@/backend/profile";
import { prisma } from "@/backend/prisma";

export const runtime = "nodejs";

type Params = {
  params: Promise<{
    username: string;
  }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: {
      username,
    },
    select: profileSelect,
  });

  if (!user) {
    return fail("사용자를 찾을 수 없습니다.", 404);
  }

  return json({ profile: serializeProfile(user) });
}
