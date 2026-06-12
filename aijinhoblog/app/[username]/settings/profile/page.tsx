import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export default async function ProfileSettingsPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-5 py-10 text-zinc-950">
      <section className="mx-auto max-w-2xl border border-zinc-300 bg-white p-6">
        <h1 className="text-2xl font-semibold tracking-normal">프로필 설정</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          프로필 설정 화면은 프로필/레이아웃 이슈에서 구현한다.
        </p>
      </section>
    </main>
  );
}
