import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

export default async function AccountSettingsPage({ params }: Props) {
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
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">계정 설정</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600">
          이메일, 비밀번호, 로그인 보안 설정은 이후 단계에서 확장합니다. 현재는 설정 진입점만 블로그
          설정 페이지에 모아 둡니다.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            className="border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${username}/settings`}
          >
            블로그 설정으로 돌아가기
          </Link>
          <Link
            className="border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${username}`}
          >
            블로그 홈
          </Link>
        </div>
      </section>
    </main>
  );
}
