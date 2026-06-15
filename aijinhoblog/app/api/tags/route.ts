import { json } from "@/backend/core/http";
import { prisma } from "@/backend/core/prisma";

export const runtime = "nodejs";

export async function GET() {
  const tags = await prisma.tag.findMany({
    where: {
      posts: {
        some: {
          post: {
            status: "PUBLISHED",
            visibility: "PUBLIC",
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          posts: {
            where: {
              post: {
                status: "PUBLISHED",
                visibility: "PUBLIC",
              },
            },
          },
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
