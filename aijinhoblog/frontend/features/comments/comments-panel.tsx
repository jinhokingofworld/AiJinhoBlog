"use client";

import { useState } from "react";
import Link from "next/link";

type Comment = {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    name: string;
  };
  createdAt: string;
};

type CurrentUser = {
  id: string;
  username: string;
  name: string;
} | null;

type Props = {
  postId: string;
  postAuthorId: string;
  currentUser: CurrentUser;
  initialComments: Comment[];
};

export function CommentsPanel({ postId, postAuthorId, currentUser, initialComments }: Props) {
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });
    const result = (await response.json()) as {
      comment?: Comment;
      error?: string;
    };

    setSaving(false);

    if (!response.ok || !result.comment) {
      setError(result.error ?? "댓글 작성에 실패했습니다.");
      return;
    }

    setComments((current) => [...current, result.comment as Comment]);
    setContent("");
  }

  async function deleteComment(commentId: string) {
    const response = await fetch(`/api/comments/${commentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? "댓글 삭제에 실패했습니다.");
      return;
    }

    setComments((current) => current.filter((comment) => comment.id !== commentId));
  }

  return (
    <section className="mt-8 border-t border-zinc-200 pt-6">
      <h2 className="text-lg font-semibold">댓글</h2>

      <div className="mt-4 space-y-3">
        {comments.length ? (
          comments.map((comment) => {
            const canDelete =
              currentUser?.id === comment.author.id || currentUser?.id === postAuthorId;

            return (
              <article className="border border-zinc-300 p-4" key={comment.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{comment.author.name}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(comment.createdAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  {canDelete ? (
                    <button
                      className="border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50"
                      onClick={() => void deleteComment(comment.id)}
                      type="button"
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                  {comment.content}
                </p>
              </article>
            );
          })
        ) : (
          <div className="border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
            아직 댓글이 없습니다.
          </div>
        )}
      </div>

      {currentUser ? (
        <form className="mt-4 space-y-3" onSubmit={submitComment}>
          <textarea
            className="min-h-24 w-full resize-y border border-zinc-300 px-3 py-2 text-sm leading-6 outline-none focus:border-zinc-950"
            minLength={2}
            onChange={(event) => setContent(event.target.value)}
            required
            value={content}
          />
          {error ? (
            <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              className="bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              disabled={saving}
              type="submit"
            >
              댓글 작성
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 border border-zinc-300 px-4 py-3 text-sm text-zinc-600">
          <Link className="font-semibold text-zinc-950 underline" href="/login">
            로그인
          </Link>
          후 댓글을 작성할 수 있습니다.
        </div>
      )}
    </section>
  );
}
