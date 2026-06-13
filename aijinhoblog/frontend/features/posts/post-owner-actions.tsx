"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PostStatusInput, PostVisibilityInput } from "@/backend/validation";

type OwnerPost = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string;
  status: PostStatusInput;
  visibility: PostVisibilityInput;
  folderId: string | null;
  tags: {
    name: string;
  }[];
};

type Props = {
  post: OwnerPost;
  username: string;
};

export function PostOwnerActions({ post, username }: Props) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<"delete" | "status" | "visibility" | null>(null);
  const [error, setError] = useState("");
  const isBusy = busyAction !== null;

  async function updatePost(
    next: Partial<Pick<OwnerPost, "status" | "visibility">>,
    action: "status" | "visibility",
  ) {
    setBusyAction(action);
    setError("");

    const response = await fetch(`/api/me/posts/${post.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        folderId: post.folderId,
        tagNames: post.tags.map((tag) => tag.name),
        status: next.status ?? post.status,
        visibility: next.visibility ?? post.visibility,
      }),
    });
    const result = (await response.json()) as { error?: string };

    setBusyAction(null);

    if (!response.ok) {
      setError(result.error ?? "게시글 상태를 변경하지 못했습니다.");
      return;
    }

    router.refresh();
  }

  async function deletePost() {
    if (!window.confirm("게시글을 삭제하시겠습니까? 삭제한 글은 되돌릴 수 없습니다.")) {
      return;
    }

    setBusyAction("delete");
    setError("");

    const response = await fetch(`/api/me/posts/${post.id}`, {
      method: "DELETE",
    });
    const result = (await response.json()) as { error?: string };

    setBusyAction(null);

    if (!response.ok) {
      setError(result.error ?? "게시글 삭제에 실패했습니다.");
      return;
    }

    router.push(`/${username}`);
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          href={`/${username}/posts/${post.id}/edit`}
        >
          수정
        </Link>
        <button
          className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:text-zinc-300"
          disabled={isBusy}
          onClick={() =>
            void updatePost(
              {
                status: post.status === "DRAFT" ? "PUBLISHED" : "DRAFT",
              },
              "status",
            )
          }
          type="button"
        >
          {busyAction === "status" ? "변경 중" : post.status === "DRAFT" ? "게시하기" : "임시저장"}
        </button>
        <button
          className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:text-zinc-300"
          disabled={isBusy}
          onClick={() =>
            void updatePost(
              {
                visibility: post.visibility === "PRIVATE" ? "PUBLIC" : "PRIVATE",
              },
              "visibility",
            )
          }
          type="button"
        >
          {busyAction === "visibility"
            ? "변경 중"
            : post.visibility === "PRIVATE"
              ? "공개로"
              : "비공개로"}
        </button>
        <button
          className="border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:text-zinc-300"
          disabled={isBusy}
          onClick={() => void deletePost()}
          type="button"
        >
          {busyAction === "delete" ? "삭제 중" : "삭제"}
        </button>
      </div>
      {error ? <p className="text-right text-xs leading-5 text-red-700">{error}</p> : null}
    </div>
  );
}
