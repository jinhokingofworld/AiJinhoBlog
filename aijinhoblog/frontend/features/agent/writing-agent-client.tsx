"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";

type PostOption = {
  id: string;
  title: string;
};

type Insights = {
  recommendations: Array<{
    reason: string;
    relatedPosts: PostOption[];
    title: string;
  }>;
  summary: {
    model: string | null;
    text: string;
  };
  topicKeywords: Array<{
    count: number;
    keyword: string;
  }>;
  writingFrequency: {
    days: number;
    postCount: number;
  };
};

type StyleProfile = {
  frequentExpressions: unknown;
  lastAnalyzedAt: string;
  sentenceSummary: string;
  toneSummary: string;
};

type RewriteResult = {
  model: string;
  originalText: string;
  rewrittenText: string;
};

type RefactorResult = {
  id: string;
  mode: string;
  originalText: string;
  postId: string | null;
  revisedText: string;
};

type Props = {
  posts: PostOption[];
  username: string;
};

// Agent 화면의 클라이언트 컴포넌트입니다.
// 버튼별 흐름: insights 조회, style profile 생성/갱신, 문체 rewrite, 게시글 refactor, refactor 결과 적용 API를 호출합니다.
function splitSentences(text: string) {
  return text.match(/[^.!?\n]+[.!?]?|\n+/g) ?? [];
}

function normalizeSentence(sentence: string) {
  return sentence
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim()
    .toLowerCase();
}

function HighlightedRevisedText({
  originalText,
  revisedText,
}: {
  originalText: string;
  revisedText: string;
}) {
  const originalSentences = new Set(
    splitSentences(originalText).map(normalizeSentence).filter(Boolean),
  );

  return (
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
      {splitSentences(revisedText).map((sentence, index) => {
        const normalized = normalizeSentence(sentence);
        const isChanged = normalized && !originalSentences.has(normalized);

        return (
          <Fragment key={`${normalized}-${index}`}>
            {isChanged ? (
              <span className="bg-amber-100 px-0.5 text-zinc-900">{sentence}</span>
            ) : (
              sentence
            )}
          </Fragment>
        );
      })}
    </p>
  );
}

export function WritingAgentClient({ posts, username }: Props) {
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState("");
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [refactorMode, setRefactorMode] = useState("sentence");
  const [refactorPostId, setRefactorPostId] = useState(posts[0]?.id ?? "");
  const [refactorResult, setRefactorResult] = useState<RefactorResult | null>(null);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [rewriteText, setRewriteText] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const payload = await requestJson<{ profile: StyleProfile | null }>(
          "/api/me/agent/style-profile",
        );

        setProfile(payload.profile);
      } catch {
        // The explicit action buttons surface recoverable agent errors to the user.
      }
    }

    void loadProfile();
  }, []);

  async function requestJson<T>(path: string, init?: RequestInit) {
    // Agent API들의 공통 fetch wrapper입니다.
    // 각 API route는 인증, rate limit, backend/ai/writing-agent.ts 호출을 담당합니다.
    setError("");
    const response = await fetch(path, init);
    const payload = (await response.json()) as T & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }

    return payload;
  }

  async function loadInsights() {
    setLoading("insights");
    try {
      const payload = await requestJson<{ insights: Insights }>("/api/me/agent/insights");

      setInsights(payload.insights);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "추천 생성에 실패했습니다.");
    } finally {
      setLoading("");
    }
  }

  async function refreshProfile() {
    // 문체 프로파일은 최근 글을 분석해 DB에 저장됩니다.
    // rewrite/refactor에서 "내 문체"의 기준으로 사용됩니다.
    setLoading("profile");
    try {
      const payload = await requestJson<{ profile: StyleProfile }>("/api/me/agent/style-profile", {
        method: "POST",
      });

      setProfile(payload.profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문체 프로파일 생성에 실패했습니다.");
    } finally {
      setLoading("");
    }
  }

  async function rewrite() {
    // 입력한 짧은 텍스트를 저장된 문체 프로파일 기준으로 다시 씁니다.
    setLoading("rewrite");
    try {
      const payload = await requestJson<{ result: RewriteResult }>("/api/me/agent/rewrite", {
        body: JSON.stringify({
          text: rewriteText,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      setRewriteResult(payload.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문체 변환에 실패했습니다.");
    } finally {
      setLoading("");
    }
  }

  async function refactor() {
    // 선택한 게시글 본문을 출판용으로 다듬고, 결과는 바로 게시글에 덮어쓰지 않고 RefactorResult로 저장합니다.
    setLoading("refactor");
    try {
      const payload = await requestJson<{ result: RefactorResult }>("/api/me/agent/refactor", {
        body: JSON.stringify({
          mode: refactorMode,
          postId: refactorPostId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      setRefactorResult(payload.result);
      setApplied(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "리팩토링에 실패했습니다.");
    } finally {
      setLoading("");
    }
  }

  async function applyRefactor() {
    if (!refactorResult) {
      return;
    }

    setLoading("apply");
    try {
      // 적용 버튼을 눌러야 refactor 결과가 실제 게시글 content에 반영되고, backend에서 벡터도 재인덱싱됩니다.
      await requestJson(`/api/me/agent/refactor/${refactorResult.id}/apply`, {
        method: "POST",
      });
      setApplied(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "리팩토링 반영에 실패했습니다.");
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="grid gap-5">
      <section className="border border-zinc-300 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">AI Agent</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">글쓰기 Agent</h1>
          </div>
          <Link
            className="shrink-0 border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${username}`}
          >
            블로그 홈
          </Link>
        </div>
        {error ? (
          <p className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      <section className="border border-zinc-300 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">글감 추천 및 인사이트</h2>
            <p className="mt-1 text-sm text-zinc-600">최근 작성 활동과 주제 변화를 분석합니다.</p>
          </div>
          <button
            className="border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:text-zinc-300"
            disabled={Boolean(loading)}
            onClick={() => void loadInsights()}
            type="button"
          >
            {loading === "insights" ? "분석 중" : "추천 보기"}
          </button>
        </div>
        {insights ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border border-zinc-300 p-4">
              <p className="text-sm text-zinc-600">
                최근 {insights.writingFrequency.days}일 글 {insights.writingFrequency.postCount}개
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {insights.topicKeywords.map((item) => (
                  <span className="border border-zinc-300 px-2 py-1 text-xs" key={item.keyword}>
                    {item.keyword} {item.count}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-600">{insights.summary.text}</p>
            </aside>
            <div className="space-y-3">
              {insights.recommendations.map((item) => (
                <article className="border border-zinc-300 p-4" key={item.title}>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{item.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.relatedPosts.map((post) => (
                      <Link
                        className="border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                        href={`/${username}/posts/${post.id}`}
                        key={post.id}
                      >
                        {post.title}
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="border border-zinc-300 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">개인 문체 프로파일</h2>
            <p className="mt-1 text-sm text-zinc-600">과거 글의 어조와 문장 습관을 정리합니다.</p>
          </div>
          <button
            className="border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:text-zinc-300"
            disabled={Boolean(loading)}
            onClick={() => void refreshProfile()}
            type="button"
          >
            {loading === "profile" ? "갱신 중" : "프로파일 갱신"}
          </button>
        </div>
        {profile ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border border-zinc-300 p-4">
              <h3 className="text-sm font-semibold">어조</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{profile.toneSummary}</p>
            </div>
            <div className="border border-zinc-300 p-4">
              <h3 className="text-sm font-semibold">문장</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{profile.sentenceSummary}</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="border border-zinc-300 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">문체 변환</h2>
        <textarea
          className="mt-4 min-h-32 w-full resize-y border border-zinc-300 px-3 py-2 leading-7 outline-none focus:border-zinc-950"
          onChange={(event) => setRewriteText(event.target.value)}
          placeholder="내 문체로 바꿀 외부 텍스트"
          value={rewriteText}
        />
        <div className="mt-3 flex justify-end">
          <button
            className="bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
            disabled={Boolean(loading) || !rewriteText.trim()}
            onClick={() => void rewrite()}
            type="button"
          >
            {loading === "rewrite" ? "변환 중" : "문체로 재작성"}
          </button>
        </div>
        {rewriteResult ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="border border-zinc-300 p-4">
              <h3 className="text-sm font-semibold">원문</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                {rewriteResult.originalText}
              </p>
            </div>
            <div className="border border-zinc-300 p-4">
              <h3 className="text-sm font-semibold">변환문</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                {rewriteResult.rewrittenText}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="border border-zinc-300 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">출판 퀄리티 리팩토링</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
          <select
            className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
            onChange={(event) => setRefactorPostId(event.target.value)}
            value={refactorPostId}
          >
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.title}
              </option>
            ))}
          </select>
          <select
            className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
            onChange={(event) => setRefactorMode(event.target.value)}
            value={refactorMode}
          >
            <option value="structure">구조 개선</option>
            <option value="sentence">문장 개선</option>
            <option value="expression">표현 개선</option>
          </select>
          <button
            className="bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
            disabled={Boolean(loading) || !refactorPostId}
            onClick={() => void refactor()}
            type="button"
          >
            {loading === "refactor" ? "리팩토링 중" : "리팩토링"}
          </button>
        </div>
        {refactorResult ? (
          <div className="mt-5">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="border border-zinc-300 p-4">
                <h3 className="text-sm font-semibold">Before</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
                  {refactorResult.originalText}
                </p>
              </div>
              <div className="border border-zinc-300 p-4">
                <h3 className="text-sm font-semibold">After</h3>
                <HighlightedRevisedText
                  originalText={refactorResult.originalText}
                  revisedText={refactorResult.revisedText}
                />
              </div>
            </div>
            {refactorResult.postId ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                {applied ? <p className="text-sm text-teal-700">게시글에 반영되었습니다.</p> : null}
                <button
                  className="border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:text-zinc-300"
                  disabled={Boolean(loading) || applied}
                  onClick={() => void applyRefactor()}
                  type="button"
                >
                  {loading === "apply" ? "반영 중" : "게시글에 반영"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
