import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/backend/auth/session";
import { listExternalConnections } from "@/backend/integrations/external-connections";
import { PageFrame } from "@/frontend/components/page-frame";
import { ExternalConnectionsClient } from "@/frontend/features/settings/external-connections-client";

type Props = {
  params: Promise<{
    username: string;
  }>;
  searchParams: Promise<{
    connected?: string;
    error?: string;
  }>;
};

function createMessage(searchParams: { connected?: string; error?: string }) {
  if (searchParams.error) {
    return searchParams.error;
  }

  if (searchParams.connected === "dropbox") {
    return "Dropbox 연결을 저장했습니다.";
  }

  return null;
}

export default async function ExternalConnectionsSettingsPage({ params, searchParams }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  const [connections, resolvedSearchParams] = await Promise.all([
    listExternalConnections(currentUser.id),
    searchParams,
  ]);

  return (
    <PageFrame paddingClassName="py-10">
      <section className="mx-auto max-w-4xl border border-zinc-300 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">외부 지식 소스</h1>
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
          <ExternalConnectionsClient
            initialConnections={connections}
            message={createMessage(resolvedSearchParams)}
            username={username}
          />
        </div>
      </section>
    </PageFrame>
  );
}
