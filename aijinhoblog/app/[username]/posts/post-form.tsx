"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PostStatusInput, PostVisibilityInput } from "@/lib/validation";

type InitialPost = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string;
  status: PostStatusInput;
  visibility: PostVisibilityInput;
  tags: {
    name: string;
  }[];
};

type Props = {
  username: string;
  mode: "create" | "edit";
  initialPost?: InitialPost;
};

function createInitialState(initialPost?: InitialPost) {
  return {
    title: initialPost?.title ?? "",
    excerpt: initialPost?.excerpt ?? "",
    content: initialPost?.content ?? "",
    tags: initialPost?.tags.map((tag) => tag.name).join(", ") ?? "",
    visibility: initialPost?.visibility ?? "PUBLIC",
  };
}

export function PostForm({ username, mode, initialPost }: Props) {
  const router = useRouter();
  const initialState = useMemo(() => createInitialState(initialPost), [initialPost]);
  const [title, setTitle] = useState(initialState.title);
  const [excerpt, setExcerpt] = useState(initialState.excerpt);
  const [content, setContent] = useState(initialState.content);
  const [tags, setTags] = useState(initialState.tags);
  const [visibility, setVisibility] = useState<PostVisibilityInput>(initialState.visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isDirty =
    title !== initialState.title ||
    excerpt !== initialState.excerpt ||
    content !== initialState.content ||
    tags !== initialState.tags ||
    visibility !== initialState.visibility;

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  async function savePost(status: PostStatusInput) {
    setSaving(true);
    setError("");

    const response = await fetch(
      mode === "create" ? "/api/me/posts" : `/api/me/posts/${initialPost?.id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          excerpt,
          content,
          tags,
          status,
          visibility,
        }),
      },
    );
    const result = (await response.json()) as {
      post?: {
        id: string;
      };
      error?: string;
    };

    setSaving(false);

    if (!response.ok || !result.post) {
      setError(result.error ?? "게시글 저장에 실패했습니다.");
      return;
    }

    router.push(`/${username}/posts/${result.post.id}`);
    router.refresh();
  }

  function cancelEdit() {
    if (
      isDirty &&
      !window.confirm("작성 중인 내용이 있습니다. 임시저장하지 않고 나가시겠습니까?")
    ) {
      return;
    }

    router.push(`/${username}`);
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void savePost("PUBLISHED");
      }}
    >
      <div>
        <label className="text-sm font-medium" htmlFor="title">
          제목
        </label>
        <input
          className="mt-2 w-full border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
          id="title"
          maxLength={160}
          minLength={2}
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="excerpt">
          요약
        </label>
        <textarea
          className="mt-2 min-h-20 w-full resize-y border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
          id="excerpt"
          maxLength={280}
          onChange={(event) => setExcerpt(event.target.value)}
          value={excerpt}
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="content">
          본문
        </label>
        <textarea
          className="mt-2 min-h-80 w-full resize-y border border-zinc-300 px-3 py-2 leading-7 outline-none focus:border-zinc-950"
          id="content"
          onChange={(event) => setContent(event.target.value)}
          value={content}
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="tags">
          태그
        </label>
        <input
          className="mt-2 w-full border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
          id="tags"
          onChange={(event) => setTags(event.target.value)}
          placeholder="ai, blog"
          value={tags}
        />
      </div>

      <fieldset className="border border-zinc-300 p-4">
        <legend className="px-1 text-sm font-medium">공개 여부</legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              checked={visibility === "PUBLIC"}
              name="visibility"
              onChange={() => setVisibility("PUBLIC")}
              type="radio"
            />
            공개
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              checked={visibility === "PRIVATE"}
              name="visibility"
              onChange={() => setVisibility("PRIVATE")}
              type="radio"
            />
            비공개
          </label>
        </div>
      </fieldset>

      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          className="border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
          disabled={saving}
          onClick={cancelEdit}
          type="button"
        >
          취소
        </button>
        <button
          className="border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
          disabled={saving}
          onClick={() => void savePost("DRAFT")}
          type="button"
        >
          임시저장
        </button>
        <button
          className="bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          disabled={saving}
          type="submit"
        >
          게시하기
        </button>
      </div>
    </form>
  );
}
