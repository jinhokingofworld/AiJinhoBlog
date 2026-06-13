import { json } from "@/backend/http";
import { prisma } from "@/backend/prisma";

export const runtime = "nodejs";

export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          posts: true,
        },
      },
    },
  });

  return json({
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      postCount: tag._count.posts,
    })),
  });
}
