import Link from "next/link";

import {
  cx,
  pageFrameMaxWidthClass,
  pageFramePaddingClass,
} from "@/frontend/components/page-frame";
import { logoutAction } from "@/backend/actions/auth-actions";
import { getCurrentUser } from "@/backend/auth";

export default async function DesktopAccountBar() {
  const currentUser = await getCurrentUser();
  const linkClass = "hover:text-zinc-950";
  const menuLinkClass = "block px-3 py-2 text-left text-xs hover:bg-zinc-100";

  return (
    <nav
      aria-label="계정 메뉴"
      className={cx(
        "fixed inset-x-0 top-2 z-50 hidden text-xs text-zinc-600 lg:block",
        pageFramePaddingClass,
      )}
    >
      <div
        className={cx(
          "mx-auto flex min-h-6 items-center justify-end gap-2",
          pageFrameMaxWidthClass,
        )}
      >
        <div className="flex min-h-6 items-center justify-end gap-2 bg-white/90 px-2 backdrop-blur">
          {currentUser ? (
            <>
              <span className="max-w-40 truncate font-medium text-zinc-950">
                {currentUser.name}
              </span>
              <span>로그인 중</span>
              <span className="text-zinc-300">|</span>
              <Link className={linkClass} href={`/${currentUser.username}`}>
                내 블로그
              </Link>
              <span className="text-zinc-300">|</span>
              <details className="relative">
                <summary className="cursor-pointer list-none hover:text-zinc-950 [&::-webkit-details-marker]:hidden">
                  내 메뉴 ▾
                </summary>
                <div className="absolute right-0 z-30 mt-2 w-40 border border-zinc-300 bg-white shadow-sm">
                  <Link className={menuLinkClass} href={`/${currentUser.username}`}>
                    내 블로그
                  </Link>
                  <Link className={menuLinkClass} href={`/${currentUser.username}/posts/new`}>
                    글쓰기
                  </Link>
                  <Link className={menuLinkClass} href={`/${currentUser.username}/settings`}>
                    블로그 설정
                  </Link>
                  <form action={logoutAction}>
                    <button
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-zinc-100"
                      type="submit"
                    >
                      로그아웃
                    </button>
                  </form>
                </div>
              </details>
            </>
          ) : (
            <>
              <span className="text-zinc-500">비로그인</span>
              <span className="text-zinc-300">|</span>
              <Link className={linkClass} href="/login">
                로그인
              </Link>
              <span className="text-zinc-300">|</span>
              <Link className={linkClass} href="/signup">
                회원가입
              </Link>
            </>
          )}
          <span className="text-zinc-300">|</span>
          <Link className={linkClass} href="/">
            블로그 홈
          </Link>
        </div>
      </div>
    </nav>
  );
}
