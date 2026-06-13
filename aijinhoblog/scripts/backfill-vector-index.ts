import type { Prisma } from "@/lib/generated/prisma";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type CliOptions = {
  delayMs: number;
  dryRun: boolean;
  includeIndexed: boolean;
  limit: number;
};

function readOptionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readCliOptions(): CliOptions {
  const args = process.argv.slice(2);

  return {
    delayMs: readPositiveInt(readOptionValue(args, "--delay-ms"), 250),
    dryRun: args.includes("--dry-run"),
    includeIndexed: args.includes("--include-indexed"),
    limit: readPositiveInt(readOptionValue(args, "--limit"), 50),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const [{ syncPostVectorIndex }, { prisma }] = await Promise.all([
    import("@/lib/ai-indexing"),
    import("@/lib/prisma"),
  ]);
  const options = readCliOptions();
  const where: Prisma.PostWhereInput = options.includeIndexed
    ? {}
    : {
        OR: [
          {
            vectorIndex: {
              is: null,
            },
          },
          {
            vectorIndex: {
              is: {
                status: {
                  in: ["FAILED", "SKIPPED"],
                },
              },
            },
          },
        ],
      };
  const posts = await prisma.post.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
    take: options.limit,
    select: {
      id: true,
      title: true,
      excerpt: true,
      content: true,
      status: true,
      visibility: true,
      authorId: true,
      folderId: true,
      vectorIndex: {
        select: {
          status: true,
        },
      },
    },
  });

  console.log(`backfill 대상 게시글: ${posts.length}개`);

  let failedCount = 0;

  for (const post of posts) {
    if (options.dryRun) {
      console.log(
        `[DRY_RUN] ${post.id} ${post.title} current=${post.vectorIndex?.status ?? "NONE"}`,
      );
      continue;
    }

    const result = await syncPostVectorIndex(post, {
      prisma,
    });

    console.log(
      `[${result.status}] ${post.id} ${post.title} chunks=${result.chunkCount} hash=${result.contentHash ?? "none"}`,
    );

    if (result.status === "FAILED") {
      failedCount += 1;
    }

    if (options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/lib/prisma");

    await prisma.$disconnect();
  });
