import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "../..");

loadEnvConfig(workspaceRoot);

type CliOptions = {
  dryRun: boolean;
  path: string;
  recursive: boolean;
  userEmail?: string;
  userId?: string;
  username?: string;
};

function readOptionValue(args: string[], name: string) {
  const index = args.indexOf(name);

  return index >= 0 ? args[index + 1] : undefined;
}

function readCliOptions(): CliOptions {
  const args = process.argv.slice(2);

  return {
    dryRun: args.includes("--dry-run"),
    path: readOptionValue(args, "--path") ?? "",
    recursive: !args.includes("--no-recursive"),
    userEmail: readOptionValue(args, "--email"),
    userId: readOptionValue(args, "--user-id"),
    username: readOptionValue(args, "--username"),
  };
}

async function readOwnerId(options: CliOptions) {
  const { prisma } = await import("@/backend/prisma");

  if (options.userId) {
    return options.userId;
  }

  const user = await prisma.user.findFirst({
    where: {
      ...(options.userEmail ? { email: options.userEmail } : {}),
      ...(options.username ? { username: options.username } : {}),
    },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  if (!user) {
    throw new Error("--user-id, --email, 또는 --username으로 동기화할 사용자를 지정해주세요.");
  }

  console.log(`동기화 사용자: ${user.username} <${user.email}> (${user.id})`);

  return user.id;
}

async function main() {
  const options = readCliOptions();

  if (options.dryRun) {
    const { createDropboxMarkdownClient } = await import("@/backend/dropbox");
    const files = await createDropboxMarkdownClient().listMarkdownFiles({
      path: options.path,
      recursive: options.recursive,
    });

    console.log(`Dropbox Markdown 파일: ${files.length}개`);
    for (const file of files) {
      console.log(`${file.pathDisplay} rev=${file.rev ?? "none"} size=${file.size ?? "unknown"}`);
    }

    return;
  }

  const ownerId = await readOwnerId(options);
  const { syncDropboxMarkdownDocuments } = await import("@/backend/dropbox-indexing");
  const { prisma } = await import("@/backend/prisma");
  const result = await syncDropboxMarkdownDocuments(
    ownerId,
    {
      path: options.path,
      recursive: options.recursive,
    },
    {
      prisma,
    },
  );

  console.log(`원격 Markdown 파일: ${result.totalRemoteFiles}개`);
  console.log(`INDEXED: ${result.indexed.length}`);
  console.log(`SKIPPED: ${result.skipped.length}`);
  console.log(`DELETED: ${result.deleted.length}`);
  console.log(`FAILED: ${result.failed.length}`);

  for (const item of [...result.indexed, ...result.skipped, ...result.deleted, ...result.failed]) {
    console.log(
      `[${item.status}] ${item.pathDisplay} chunks=${item.chunkCount} hash=${item.contentHash ?? "none"} message=${item.message}`,
    );
  }

  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("@/backend/prisma");

    await prisma.$disconnect();
  });
