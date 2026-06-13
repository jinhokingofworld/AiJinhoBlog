import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageFrame } from "@/frontend/components/page-frame";
import { getCurrentUser } from "@/backend/auth";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{
    username: string;
  }>;
};

const settingLinks = [
  {
    description: "이름, 소개, 프로필 이미지, 블로그 제목과 커버 이미지를 수정합니다.",
    href: (username: string) => `/${username}/settings/profile`,
    label: "프로필 설정",
  },
  {
    description: "블로그 색상, 배너, 레이아웃 같은 디자인 옵션을 관리할 예정입니다.",
    href: (username: string) => `/${username}/settings/design`,
    label: "블로그 디자인 설정",
  },
  {
    description: "이메일, 비밀번호, 로그인 보안 같은 계정 옵션을 관리할 예정입니다.",
    href: (username: string) => `/${username}/settings/account`,
    label: "계정 설정",
  },
  {
    description: "글 목록에서 사용할 폴더를 추가, 수정, 이동, 병합, 삭제합니다.",
    href: (username: string) => `/${username}/settings/folders`,
    label: "폴더 설정",
  },
  {
    description: "게시글과 Dropbox Markdown 문서를 함께 검색해 질문에 답합니다.",
    href: (username: string) => `/${username}/memory`,
    label: "내 기억 Q&A",
  },
] as const;

export default async function BlogSettingsPage({ params }: Props) {
  const { username } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.username !== username) {
    notFound();
  }

  return (
    <PageFrame paddingClassName="py-10">
      <section className="mx-auto max-w-4xl border border-zinc-300 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">블로그 설정</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              프로필, 디자인, 계정, 폴더 설정으로 이동하는 진입점을 한 곳에 모았습니다.
            </p>
          </div>
          <Link
            className="shrink-0 border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${username}`}
          >
            블로그 홈
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {settingLinks.map((item) => (
            <Link
              className="block min-h-32 border border-zinc-300 p-5 hover:bg-zinc-50"
              href={item.href(username)}
              key={item.label}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{item.label}</h2>
                <span className="shrink-0 border border-zinc-300 px-2 py-1 text-xs text-zinc-600">
                  이동
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-600">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </PageFrame>
  );
}
