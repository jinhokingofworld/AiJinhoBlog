"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string;
};

type Tag = {
  id: string;
  name: string;
  postCount?: number;
};

type Comment = {
  id: string;
  content: string;
  author: User;
  createdAt: string;
};

type Post = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string;
  author: User;
  tags: Tag[];
  commentCount: number;
  comments?: Comment[];
  createdAt: string;
  updatedAt: string;
};

type PostForm = {
  title: string;
  excerpt: string;
  content: string;
  tags: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const emptyPostForm: PostForm = {
  title: "",
  excerpt: "",
  content: "",
  tags: "",
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
  }

  return data;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    name: "",
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [postForm, setPostForm] = useState<PostForm>(emptyPostForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canEditSelected = Boolean(user && selectedPost && user.id === selectedPost.author.id);

  const tagOptions = useMemo(() => tags.filter((tag) => tag.postCount), [tags]);

  async function loadMe() {
    const data = await requestJson<{ user: User | null }>("/api/auth/me");
    setUser(data.user);
  }

  async function loadTags() {
    const data = await requestJson<{ tags: Tag[] }>("/api/tags");
    setTags(data.tags);
  }

  async function loadPosts(nextPage = page, filters: { query?: string; tag?: string } = {}) {
    const nextQuery = filters.query ?? query;
    const nextTag = filters.tag ?? selectedTag;
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: "10",
    });

    if (nextQuery.trim()) {
      params.set("query", nextQuery.trim());
    }

    if (nextTag) {
      params.set("tag", nextTag);
    }

    const data = await requestJson<{ posts: Post[]; pagination: Pagination }>(
      `/api/posts?${params}`,
    );

    setPosts(data.posts);
    setPagination(data.pagination);
    setPage(data.pagination.page);
  }

  async function loadPost(id: string) {
    const data = await requestJson<{ post: Post }>(`/api/posts/${id}`);
    setSelectedPost(data.post);
  }

  // Initial browser-side sync keeps the build independent from a live database.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    void loadMe().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "사용자 조회 실패");
    });
    void loadTags().catch(() => null);
    void loadPosts(1).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "게시글 조회 실패");
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const data = await requestJson<{ user: User }>(endpoint, {
        method: "POST",
        body: JSON.stringify(authForm),
      });

      setUser(data.user);
      setAuthForm({ email: "", password: "", name: "" });
      setMessage("인증이 완료되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "인증 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await requestJson<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    });
    setUser(null);
    setSelectedPost(null);
    setMessage("로그아웃했습니다.");
  }

  async function handleSavePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const currentEditId = editingId;
      const endpoint = currentEditId ? `/api/posts/${currentEditId}` : "/api/posts";
      const method = currentEditId ? "PATCH" : "POST";
      const data = await requestJson<{ post: Post }>(endpoint, {
        method,
        body: JSON.stringify({
          title: postForm.title,
          excerpt: postForm.excerpt,
          content: postForm.content,
          tags: postForm.tags,
        }),
      });

      setPostForm(emptyPostForm);
      setEditingId(null);
      setSelectedPost(data.post);
      await loadPosts(1);
      await loadTags();
      setMessage(currentEditId ? "게시글을 수정했습니다." : "게시글을 작성했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "게시글 저장 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePost() {
    if (!selectedPost) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await requestJson<{ ok: boolean }>(`/api/posts/${selectedPost.id}`, {
        method: "DELETE",
      });
      setSelectedPost(null);
      setEditingId(null);
      setPostForm(emptyPostForm);
      await loadPosts(1);
      await loadTags();
      setMessage("게시글을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "게시글 삭제 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPost) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await requestJson<{ comment: Comment }>(`/api/posts/${selectedPost.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: comment }),
      });
      setComment("");
      await loadPost(selectedPost.id);
      await loadPosts(page);
      setMessage("댓글을 작성했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글 작성 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!selectedPost) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await requestJson<{ ok: boolean }>(`/api/comments/${commentId}`, {
        method: "DELETE",
      });
      await loadPost(selectedPost.id);
      await loadPosts(page);
      setMessage("댓글을 삭제했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "댓글 삭제 실패");
    } finally {
      setLoading(false);
    }
  }

  function startEditing(post: Post) {
    setEditingId(post.id);
    setPostForm({
      title: post.title,
      excerpt: post.excerpt ?? "",
      content: post.content,
      tags: post.tags.map((tag) => tag.name).join(", "),
    });
  }

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-sm font-medium text-teal-700">AiJinhoBlog</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">
              기본 블로그 관리
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-zinc-600">
                  {user.name} ({user.email})
                </span>
                <button
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                  type="button"
                  onClick={handleLogout}
                >
                  로그아웃
                </button>
              </>
            ) : (
              <span className="text-sm text-zinc-600">
                로그인 후 글과 댓글을 작성할 수 있습니다.
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex rounded-md bg-zinc-100 p-1">
              <button
                className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
                  authMode === "login" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600"
                }`}
                type="button"
                onClick={() => setAuthMode("login")}
              >
                로그인
              </button>
              <button
                className={`flex-1 rounded px-3 py-2 text-sm font-medium ${
                  authMode === "signup" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600"
                }`}
                type="button"
                onClick={() => setAuthMode("signup")}
              >
                회원가입
              </button>
            </div>
            <form className="space-y-3" onSubmit={handleAuth}>
              {authMode === "signup" ? (
                <label className="block text-sm font-medium text-zinc-700">
                  이름
                  <input
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                    value={authForm.name}
                    onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                  />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-zinc-700">
                이메일
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700">
                비밀번호
                <input
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                />
              </label>
              <button
                className="w-full rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                disabled={loading}
              >
                {authMode === "signup" ? "계정 만들기" : "로그인"}
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-950">
              {editingId ? "게시글 수정" : "새 게시글"}
            </h2>
            <form className="mt-4 space-y-3" onSubmit={handleSavePost}>
              <input
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                placeholder="제목"
                value={postForm.title}
                onChange={(event) => setPostForm({ ...postForm, title: event.target.value })}
              />
              <input
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                placeholder="요약"
                value={postForm.excerpt}
                onChange={(event) => setPostForm({ ...postForm, excerpt: event.target.value })}
              />
              <textarea
                className="min-h-40 w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                placeholder="본문"
                value={postForm.content}
                onChange={(event) => setPostForm({ ...postForm, content: event.target.value })}
              />
              <input
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                placeholder="태그: ai, blog, next"
                value={postForm.tags}
                onChange={(event) => setPostForm({ ...postForm, tags: event.target.value })}
              />
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                  disabled={!user || loading}
                >
                  {editingId ? "수정 저장" : "작성"}
                </button>
                {editingId ? (
                  <button
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setPostForm(emptyPostForm);
                    }}
                  >
                    취소
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          {message ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {message}
            </p>
          ) : null}
        </aside>

        <section className="space-y-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <input
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                placeholder="키워드 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                value={selectedTag}
                onChange={(event) => setSelectedTag(event.target.value)}
              >
                <option value="">전체 태그</option>
                {tagOptions.map((tag) => (
                  <option key={tag.id} value={tag.name}>
                    {tag.name} ({tag.postCount})
                  </option>
                ))}
              </select>
              <button
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                type="button"
                onClick={() => void loadPosts(1)}
              >
                검색
              </button>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-3">
              {posts.map((post) => (
                <article
                  className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                  key={post.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <button
                        className="text-left text-lg font-semibold text-zinc-950 hover:text-teal-700"
                        type="button"
                        onClick={() => void loadPost(post.id)}
                      >
                        {post.title}
                      </button>
                      <p className="mt-1 text-sm text-zinc-600">
                        {post.author.name} · {new Date(post.createdAt).toLocaleDateString("ko-KR")}{" "}
                        · 댓글 {post.commentCount}
                      </p>
                    </div>
                    <button
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                      type="button"
                      onClick={() => void loadPost(post.id)}
                    >
                      열기
                    </button>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-700">
                    {post.excerpt || post.content}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <button
                        className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          setSelectedTag(tag.name);
                          void loadPosts(1, { tag: tag.name });
                        }}
                      >
                        #{tag.name}
                      </button>
                    ))}
                  </div>
                </article>
              ))}

              <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
                <span>
                  {pagination.total}개 · {pagination.page}/{pagination.totalPages} 페이지
                </span>
                <div className="flex gap-2">
                  <button
                    className="rounded-md border border-zinc-300 px-3 py-2 font-medium disabled:opacity-40"
                    disabled={page <= 1}
                    type="button"
                    onClick={() => void loadPosts(page - 1)}
                  >
                    이전
                  </button>
                  <button
                    className="rounded-md border border-zinc-300 px-3 py-2 font-medium disabled:opacity-40"
                    disabled={page >= pagination.totalPages}
                    type="button"
                    onClick={() => void loadPosts(page + 1)}
                  >
                    다음
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              {selectedPost ? (
                <article>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-zinc-950">{selectedPost.title}</h2>
                      <p className="mt-1 text-sm text-zinc-600">
                        {selectedPost.author.name} ·{" "}
                        {new Date(selectedPost.createdAt).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    {canEditSelected ? (
                      <div className="flex gap-2">
                        <button
                          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                          type="button"
                          onClick={() => startEditing(selectedPost)}
                        >
                          수정
                        </button>
                        <button
                          className="rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800"
                          type="button"
                          onClick={() => void handleDeletePost()}
                        >
                          삭제
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedPost.tags.map((tag) => (
                      <span
                        className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900"
                        key={tag.id}
                      >
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                  <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-zinc-800">
                    {selectedPost.content}
                  </p>

                  <div className="mt-6 border-t border-zinc-200 pt-4">
                    <h3 className="text-base font-semibold">댓글</h3>
                    <div className="mt-3 space-y-3">
                      {selectedPost.comments?.map((item) => (
                        <div
                          className="rounded-md border border-zinc-200 bg-zinc-50 p-3"
                          key={item.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-zinc-900">{item.author.name}</p>
                            {user &&
                            (user.id === item.author.id || user.id === selectedPost.author.id) ? (
                              <button
                                className="text-sm font-medium text-rose-700 hover:text-rose-900"
                                type="button"
                                onClick={() => void handleDeleteComment(item.id)}
                              >
                                삭제
                              </button>
                            ) : null}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                            {item.content}
                          </p>
                        </div>
                      ))}
                    </div>
                    <form className="mt-4 space-y-2" onSubmit={handleCreateComment}>
                      <textarea
                        className="min-h-24 w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
                        placeholder="댓글"
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                      />
                      <button
                        className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                        disabled={!user || loading}
                      >
                        댓글 작성
                      </button>
                    </form>
                  </div>
                </article>
              ) : (
                <div className="py-16 text-center text-sm text-zinc-500">
                  게시글을 선택하면 상세 내용과 댓글이 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
