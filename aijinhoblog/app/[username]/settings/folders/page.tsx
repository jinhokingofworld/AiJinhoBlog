import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { PageFrame } from "@/frontend/components/page-frame";
import { FolderSettingsClient } from "@/frontend/features/settings/folder-settings-client";
import { getCurrentUser } from "@/backend/auth/session";
import { ensureDefaultFolder, listFolders, serializeFolder } from "@/backend/posts/folders";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export default async function FolderSettingsPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  await ensureDefaultFolder(currentUser.id);
  const folders = await listFolders(currentUser.id);

  return (
    <PageFrame paddingClassName="py-10">
      <section className="mx-auto max-w-4xl border border-zinc-300 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">폴더 관리</h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              className="border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
              href={`/${username}/settings`}
            >
              블로그 설정
            </Link>
            <Link
              className="border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
              href={`/${username}`}
            >
              블로그 홈
            </Link>
          </div>
        </div>
        <div className="mt-6">
          <FolderSettingsClient initialFolders={folders.map(serializeFolder)} username={username} />
        </div>
      </section>
    </PageFrame>
  );
}
