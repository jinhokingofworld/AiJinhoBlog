"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PostStatusInput, PostVisibilityInput } from "@/backend/validation";

type InitialPost = {
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

type FolderOption = {
  id: string;
  name: string;
};

type DuplicateCandidate = {
  chunk: string;
  chunkId: string;
  score: number | null;
  source: {
    id: string;
    path: string | null;
    title: string;
    type: "DROPBOX_MD" | "POST";
    url: string | null;
  };
};

type Props = {
  username: string;
  mode: "create" | "edit";
  folders: FolderOption[];
  initialPost?: InitialPost;
};

function createInitialState(folders: FolderOption[], initialPost?: InitialPost) {
  return {
    title: initialPost?.title ?? "",
    excerpt: initialPost?.excerpt ?? "",
    content: initialPost?.content ?? "",
    tags: initialPost?.tags.map((tag) => tag.name).join(", ") ?? "",
    visibility: initialPost?.visibility ?? "PUBLIC",
    folderId: initialPost?.folderId ?? folders[0]?.id ?? "",
  };
}

export function PostForm({ username, mode, folders, initialPost }: Props) {
  const router = useRouter();
  const initialState = useMemo(
    () => createInitialState(folders, initialPost),
    [folders, initialPost],
  );
  const [title, setTitle] = useState(initialState.title);
  const [excerpt, setExcerpt] = useState(initialState.excerpt);
  const [content, setContent] = useState(initialState.content);
  const [tags, setTags] = useState(initialState.tags);
  const [visibility, setVisibility] = useState<PostVisibilityInput>(initialState.visibility);
  const [folderId, setFolderId] = useState(initialState.folderId);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);
  const [duplicateCheckedKey, setDuplicateCheckedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const isDirty =
    title !== initialState.title ||
    excerpt !== initialState.excerpt ||
    content !== initialState.content ||
    tags !== initialState.tags ||
    visibility !== initialState.visibility ||
    folderId !== initialState.folderId;
  const duplicateKey = JSON.stringify({
    content,
    excerpt,
    title,
  });
  const hasFreshDuplicateCheck = duplicateCheckedKey === duplicateKey;

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

  async function checkDuplicateCandidates() {
    if (!title.trim() && !content.trim()) {
      setError("유사 자료를 확인하려면 제목 또는 본문을 입력해주세요.");
      return null;
    }

    setCheckingDuplicates(true);
    setError("");

    const response = await fetch("/api/me/rag/duplicates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        excerpt,
        limit: 5,
        title,
      }),
    });
    const result = (await response.json()) as {
      candidates?: DuplicateCandidate[];
      error?: string;
    };

    setCheckingDuplicates(false);

    if (!response.ok || !result.candidates) {
      setError(result.error ?? "유사 자료 확인에 실패했습니다.");
      return null;
    }

    const candidates = result.candidates.filter(
      (candidate) => !(candidate.source.type === "POST" && candidate.source.id === initialPost?.id),
    );

    setDuplicateCandidates(candidates);
    setDuplicateCheckedKey(duplicateKey);

    return candidates;
  }

  async function savePost(
    status: PostStatusInput,
    options: {
      skipDuplicateBlock?: boolean;
    } = {},
  ) {
    setSaving(true);
    setError("");

    if (status === "PUBLISHED" && !options.skipDuplicateBlock) {
      const candidates =
        duplicateCheckedKey === duplicateKey
          ? duplicateCandidates
          : await checkDuplicateCandidates();

      if (!candidates) {
        setSaving(false);
        return;
      }

      if (candidates.length) {
        setSaving(false);
        setError("유사한 게시글 또는 Dropbox 문서가 있습니다. 확인 후 게시해주세요.");
        return;
      }
    }

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
          folderId,
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

  async function deletePost() {
    if (!initialPost) {
      return;
    }

    if (!window.confirm("게시글을 삭제하시겠습니까? 삭제한 글은 되돌릴 수 없습니다.")) {
      return;
    }

    setSaving(true);
    setError("");

    const response = await fetch(`/api/me/posts/${initialPost.id}`, {
      method: "DELETE",
    });
    const result = (await response.json()) as {
      error?: string;
    };

    setSaving(false);

    if (!response.ok) {
      setError(result.error ?? "게시글 삭제에 실패했습니다.");
      return;
    }

    router.push(`/${username}`);
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
        <label className="text-sm font-medium" htmlFor="folderId">
          폴더
        </label>
        <select
          className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-zinc-950"
          id="folderId"
          onChange={(event) => setFolderId(event.target.value)}
          value={folderId}
        >
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {mode === "edit" ? (
          <button
            className="w-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:text-zinc-300 sm:w-auto"
            disabled={saving}
            onClick={() => void deletePost()}
            type="button"
          >
            삭제
          </button>
        ) : (
          <span className="hidden sm:block" />
        )}
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
      </div>
      <div className="border border-zinc-300 bg-zinc-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">유사 자료 확인</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              게시글과 Dropbox Markdown에서 비슷한 내용을 찾습니다.
            </p>
          </div>
          <button
            className="shrink-0 border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:text-zinc-300"
            disabled={saving || checkingDuplicates}
            onClick={() => void checkDuplicateCandidates()}
            type="button"
          >
            {checkingDuplicates ? "확인 중" : "확인"}
          </button>
        </div>
        {hasFreshDuplicateCheck ? (
          duplicateCandidates.length ? (
            <div className="mt-4 space-y-2">
              {duplicateCandidates.map((candidate) => (
                <div className="border border-zinc-300 bg-white p-3" key={candidate.chunkId}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-teal-700">
                        {candidate.source.type === "POST" ? "게시글" : "Dropbox Markdown"}
                      </p>
                      {candidate.source.url ? (
                        <a
                          className="mt-1 block truncate text-sm font-semibold hover:underline"
                          href={candidate.source.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {candidate.source.title}
                        </a>
                      ) : (
                        <p className="mt-1 truncate text-sm font-semibold">
                          {candidate.source.title}
                        </p>
                      )}
                      {candidate.source.path ? (
                        <p className="mt-1 truncate text-xs text-zinc-500">
                          {candidate.source.path}
                        </p>
                      ) : null}
                    </div>
                    {candidate.score !== null ? (
                      <span className="shrink-0 text-xs text-zinc-500">
                        score {candidate.score}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-600">
                    {candidate.chunk}
                  </p>
                </div>
              ))}
              <div className="flex justify-end">
                <button
                  className="border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:text-zinc-300"
                  disabled={saving}
                  onClick={() => void savePost("PUBLISHED", { skipDuplicateBlock: true })}
                  type="button"
                >
                  무시하고 게시하기
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600">유사한 자료가 없습니다.</p>
          )
        ) : null}
      </div>
    </form>
  );
}
