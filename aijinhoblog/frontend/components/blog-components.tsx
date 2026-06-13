import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/frontend/components/page-frame";

export type BlogProfileView = {
  username: string;
  name: string;
  intro: string;
  blogTitle: string;
  profileImageUrl: string;
  coverImageUrl: string;
};

type BlogHeroHeaderProps = {
  actions?: ReactNode;
  align?: "start" | "center";
  profile: BlogProfileView;
  titleHref?: string;
};

export function BlogHeroHeader({
  actions,
  align = "start",
  profile,
  titleHref,
}: BlogHeroHeaderProps) {
  const title = titleHref ? (
    <Link className="mt-2 block text-2xl font-semibold tracking-normal" href={titleHref}>
      {profile.blogTitle}
    </Link>
  ) : (
    <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal sm:text-3xl">
      {profile.blogTitle}
    </h1>
  );

  return (
    <header
      className="relative overflow-visible border border-zinc-300 bg-white bg-cover bg-center"
      style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,.84), rgba(255,255,255,.92)), url(${profile.coverImageUrl})`,
      }}
    >
      <div
        className={cx(
          align === "center"
            ? "flex min-h-40 items-center justify-center px-6 text-center"
            : "flex min-h-24 items-start justify-between gap-4 px-4 py-4 sm:min-h-32 sm:px-6",
        )}
      >
        <div className={align === "center" ? "" : "min-w-0 pt-1"}>
          <p className="text-xs font-semibold text-teal-700 sm:text-sm">AiJinhoBlog</p>
          {title}
        </div>
        {actions}
      </div>
    </header>
  );
}

type ProfileSummaryCardProps = {
  imageSize?: number;
  mode?: "default" | "detail";
  profile: BlogProfileView;
};

export function ProfileSummaryCard({
  imageSize = 226,
  mode = "default",
  profile,
}: ProfileSummaryCardProps) {
  const isDetailMode = mode === "detail";

  return (
    <section
      className={cx(
        "border border-zinc-300 bg-white p-4",
        isDetailMode ? "flex items-start gap-4 lg:block" : "",
      )}
    >
      <Image
        alt={`${profile.name} 프로필 이미지`}
        className={cx(
          "aspect-square border border-zinc-300 bg-zinc-50 object-cover",
          isDetailMode ? "h-20 w-20 shrink-0 sm:h-24 sm:w-24 lg:h-auto lg:w-full" : "w-full",
        )}
        height={imageSize}
        src={profile.profileImageUrl}
        width={imageSize}
      />
      <div className={isDetailMode ? "min-w-0 lg:mt-4" : ""}>
        <h2 className={cx("font-semibold", isDetailMode ? "text-base lg:text-lg" : "mt-4 text-lg")}>
          {profile.name}
        </h2>
        <p
          className={cx(
            "text-sm leading-6 text-zinc-600",
            isDetailMode ? "mt-2 line-clamp-3 lg:mt-3 lg:line-clamp-none" : "mt-3",
          )}
        >
          {profile.intro}
        </p>
      </div>
    </section>
  );
}

type FolderOption = {
  id: string;
  name: string;
};

type FolderDropdownProps = {
  allHref: string;
  folders: FolderOption[];
  getFolderHref: (folderId: string) => string;
  selectedFolderId: string | null;
  selectedFolderLabel: string;
};

export function FolderDropdown({
  allHref,
  folders,
  getFolderHref,
  selectedFolderId,
  selectedFolderLabel,
}: FolderDropdownProps) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center justify-between border border-zinc-300 px-3 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span>폴더</span>
        <span className="min-w-0 truncate font-normal text-zinc-600">{selectedFolderLabel}</span>
      </summary>
      <div className="absolute left-0 right-0 z-10 mt-1 max-h-64 overflow-auto border border-zinc-300 bg-white shadow-sm">
        <Link
          className={`block px-3 py-3 text-sm ${selectedFolderId ? "hover:bg-zinc-50" : "bg-zinc-950 text-white"}`}
          href={allHref}
        >
          전체
        </Link>
        {folders.map((folder) => (
          <Link
            className={`block border-t border-zinc-300 px-3 py-3 text-sm ${selectedFolderId === folder.id ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
            href={getFolderHref(folder.id)}
            key={folder.id}
          >
            {folder.name}
          </Link>
        ))}
      </div>
    </details>
  );
}

type PaginationProps = {
  getPageHref: (page: number) => string;
  page: number;
  pageNumbers: number[];
  totalPages: number;
};

export function Pagination({ getPageHref, page, pageNumbers, totalPages }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 text-sm sm:justify-end lg:justify-center">
      <Link
        aria-disabled={page <= 1}
        aria-label="이전 페이지"
        className={`border border-zinc-300 px-3 py-2 ${page <= 1 ? "pointer-events-none text-zinc-300" : "hover:bg-zinc-50"}`}
        href={getPageHref(Math.max(1, page - 1))}
      >
        &lt;
      </Link>
      {pageNumbers.map((pageNumber) => (
        <Link
          aria-current={pageNumber === page ? "page" : undefined}
          className={`border border-zinc-300 px-3 py-2 ${pageNumber === page ? "bg-zinc-950 text-white" : "hover:bg-zinc-50"}`}
          href={getPageHref(pageNumber)}
          key={pageNumber}
        >
          {pageNumber}
        </Link>
      ))}
      <Link
        aria-disabled={page >= totalPages}
        aria-label="다음 페이지"
        className={`border border-zinc-300 px-3 py-2 ${page >= totalPages ? "pointer-events-none text-zinc-300" : "hover:bg-zinc-50"}`}
        href={getPageHref(Math.min(totalPages, page + 1))}
      >
        &gt;
      </Link>
    </nav>
  );
}
