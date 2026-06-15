"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { PostStatusInput, PostVisibilityInput } from "@/backend/core/validation";

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

type DraftPost = InitialPost & {
  createdAt: string;
  updatedAt: string;
};

type DuplicateCandidate = {
  chunk: string;
  chunkId: string;
  score: number | null;
  source: {
    id: string;
    path: string | null;
    title: string;
    type: "DROPBOX_MD" | "NOTION_PAGE" | "POST";
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
  const [content, setContent] = useState(initialState.content);
  const [tags, setTags] = useState(initialState.tags);
  const [visibility, setVisibility] = useState<PostVisibilityInput>(initialState.visibility);
  const [folderId, setFolderId] = useState(initialState.folderId);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicateCandidate[]>([]);
  const [duplicateCheckedKey, setDuplicateCheckedKey] = useState("");
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const activePostId = initialPost?.id ?? loadedDraftId;
  const isDirty =
    title !== initialState.title ||
    content !== initialState.content ||
    tags !== initialState.tags ||
    visibility !== initialState.visibility ||
    folderId !== initialState.folderId;
  const duplicateKey = JSON.stringify({
    content,
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

  async function loadDraftList() {
    setDraftsOpen((current) => !current);

    if (draftsLoaded) {
      return;
    }

    setLoadingDrafts(true);
    setError("");

    const response = await fetch("/api/me/posts/drafts");
    const result = (await response.json()) as {
      drafts?: DraftPost[];
      error?: string;
    };

    setLoadingDrafts(false);

    if (!response.ok || !result.drafts) {
      setError(result.error ?? "임시저장 목록을 불러오지 못했습니다.");
      return;
    }

    setDrafts(result.drafts);
    setDraftsLoaded(true);
  }

  function applyDraft(draft: DraftPost) {
    if (isDirty && !window.confirm("현재 입력 중인 내용을 임시저장 글로 바꾸시겠습니까?")) {
      return;
    }

    setTitle(draft.title);
    setContent(draft.content);
    setTags(draft.tags.map((tag) => tag.name).join(", "));
    setVisibility(draft.visibility);
    setFolderId(draft.folderId ?? folders[0]?.id ?? "");
    setLoadedDraftId(draft.id);
    setDuplicateCandidates([]);
    setDuplicateCheckedKey("");
    setDraftsOpen(false);
    setError("");
  }

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
        excerpt: "",
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
      (candidate) => !(candidate.source.type === "POST" && candidate.source.id === activePostId),
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

    const response = await fetch(activePostId ? `/api/me/posts/${activePostId}` : "/api/me/posts", {
      method: activePostId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        content,
        tags,
        status,
        visibility,
        folderId,
      }),
    });
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
      <section className="border border-zinc-300 bg-zinc-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">임시저장 불러오기</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              저장해 둔 임시글을 현재 입력 폼으로 불러옵니다.
            </p>
          </div>
          <button
            className="shrink-0 border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:text-zinc-300"
            disabled={loadingDrafts || saving}
            onClick={() => void loadDraftList()}
            type="button"
          >
            {loadingDrafts ? "불러오는 중" : "불러오기"}
          </button>
        </div>

        {loadedDraftId ? (
          <p className="mt-3 border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
            {mode === "create"
              ? "임시저장 글을 불러왔습니다. 게시하면 해당 임시글이 게시글로 전환됩니다."
              : "임시저장 글을 불러왔습니다. 저장하면 현재 수정 중인 글에 반영됩니다."}
          </p>
        ) : null}

        {draftsOpen ? (
          <div className="mt-4 border border-zinc-300 bg-white">
            {loadingDrafts ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">
                임시저장 목록을 불러오는 중입니다.
              </p>
            ) : drafts.length ? (
              drafts.map((draft) => (
                <div
                  className="flex flex-col gap-3 border-b border-zinc-200 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  key={draft.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{draft.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      마지막 수정 {new Date(draft.updatedAt).toLocaleString("ko-KR")}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">
                      {draft.excerpt || draft.content || "본문 없음"}
                    </p>
                  </div>
                  <button
                    className="shrink-0 border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                    onClick={() => applyDraft(draft)}
                    type="button"
                  >
                    이 글 불러오기
                  </button>
                </div>
              ))
            ) : (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">
                임시저장된 글이 없습니다.
              </p>
            )}
          </div>
        ) : null}
      </section>

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

      <div className="border border-teal-200 bg-teal-50 px-3 py-3 text-sm leading-6 text-teal-900">
        <p className="font-medium">요약은 저장할 때 AI가 본문을 읽고 자동 작성합니다.</p>
        {initialPost?.excerpt ? (
          <p className="mt-2 text-teal-800">현재 요약: {initialPost.excerpt}</p>
        ) : null}
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
                        {candidate.source.type === "POST"
                          ? "게시글"
                          : candidate.source.type === "DROPBOX_MD"
                            ? "Dropbox Markdown"
                            : "Notion"}
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
