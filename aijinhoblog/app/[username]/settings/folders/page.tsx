import { notFound, redirect } from "next/navigation";

import { FolderSettingsClient } from "@/app/[username]/settings/folders/folder-settings-client";
import { getCurrentUser } from "@/lib/auth";
import { ensureDefaultFolder, listFolders, serializeFolder } from "@/lib/folders";

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
    <main className="min-h-screen bg-[#f8f7f4] px-5 py-10 text-zinc-950">
      <section className="mx-auto max-w-4xl border border-zinc-300 bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-normal">폴더 관리</h1>
        <div className="mt-6">
          <FolderSettingsClient initialFolders={folders.map(serializeFolder)} username={username} />
        </div>
      </section>
    </main>
  );
}
