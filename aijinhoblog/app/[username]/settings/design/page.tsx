import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export default async function BlogDesignSettingsPage({ params }: Props) {
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
      <section className="mx-auto max-w-3xl border border-zinc-300 bg-white p-6">
        <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">블로그 디자인 설정</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          별도 디자인 설정 화면은 이후 단계에서 확장합니다. 현재 블로그 제목과 커버 이미지는 프로필
          설정에서 수정할 수 있습니다.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="border border-zinc-950 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${username}/settings/profile`}
          >
            프로필 설정으로 이동
          </Link>
          <Link
            className="border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${username}/settings`}
          >
            블로그 설정으로 돌아가기
          </Link>
        </div>
      </section>
    </main>
  );
}
