"use client";

import Link from "next/link";
import { useState } from "react";

type RagSource = {
  chunk: string;
  chunkId: string;
  distance: number | null;
  score: number | null;
  source: {
    id: string;
    path: string | null;
    title: string;
    type: "DROPBOX_MD" | "POST";
    url: string | null;
  };
};

type RagAnswer = {
  answer: string;
  model: string | null;
  question: string;
  sources: RagSource[];
};

type Props = {
  username: string;
};

function SourceList({ sources }: { sources: RagSource[] }) {
  if (!sources.length) {
    return null;
  }

  return (
    <div className="mt-5 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-500">근거</h2>
      {sources.map((item, index) => (
        <article className="border border-zinc-300 p-4" key={`${item.chunkId}-${index}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-teal-700">
                {item.source.type === "POST" ? "게시글" : "Dropbox Markdown"}
              </p>
              {item.source.url ? (
                <Link
                  className="mt-1 block truncate text-base font-semibold hover:underline"
                  href={item.source.url}
                >
                  {item.source.title}
                </Link>
              ) : (
                <h3 className="mt-1 truncate text-base font-semibold">{item.source.title}</h3>
              )}
              {item.source.path ? (
                <p className="mt-1 truncate text-xs text-zinc-500">{item.source.path}</p>
              ) : null}
            </div>
            {item.score !== null ? (
              <span className="shrink-0 border border-zinc-300 px-2 py-1 text-xs text-zinc-600">
                score {item.score}
              </span>
            ) : null}
          </div>
          <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-600">
            {item.chunk}
          </p>
        </article>
      ))}
    </div>
  );
}

export function MemoryQaClient({ username }: Props) {
  const [answer, setAnswer] = useState<RagAnswer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");

  async function askQuestion() {
    const trimmed = question.trim();

    if (!trimmed) {
      setError("질문을 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    const response = await fetch("/api/me/rag/answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: 6,
        question: trimmed,
      }),
    });
    const payload = (await response.json()) as {
      error?: string;
      result?: RagAnswer;
    };

    setLoading(false);

    if (!response.ok || !payload.result) {
      setError(payload.error ?? "답변 생성에 실패했습니다.");
      return;
    }

    setAnswer(payload.result);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="border border-zinc-300 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">RAG</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">내 기억 Q&amp;A</h1>
          </div>
          <Link
            className="shrink-0 border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${username}`}
          >
            블로그 홈
          </Link>
        </div>

        <div className="mt-6">
          <label className="text-sm font-medium" htmlFor="memory-question">
            질문
          </label>
          <textarea
            className="mt-2 min-h-32 w-full resize-y border border-zinc-300 px-3 py-2 leading-7 outline-none focus:border-zinc-950"
            id="memory-question"
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="예: 정글 웹개발 집중캠프에서 배운 내용을 요약해줘"
            value={question}
          />
        </div>

        {error ? (
          <p className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            className="bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
            disabled={loading}
            onClick={() => void askQuestion()}
            type="button"
          >
            {loading ? "검색 중" : "답변 받기"}
          </button>
        </div>

        {answer ? (
          <section className="mt-6 border-t border-zinc-200 pt-5">
            <h2 className="text-lg font-semibold">답변</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-700">
              {answer.answer}
            </p>
            {answer.model ? (
              <p className="mt-3 text-xs text-zinc-500">model: {answer.model}</p>
            ) : null}
            <SourceList sources={answer.sources} />
          </section>
        ) : null}
      </section>

      <aside className="border border-zinc-300 bg-white p-5">
        <h2 className="text-base font-semibold">검색 범위</h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
          <p>게시글 chunk와 Dropbox Markdown chunk를 함께 검색합니다.</p>
          <p>답변에는 사용된 게시글 링크 또는 Dropbox 문서 경로가 함께 표시됩니다.</p>
        </div>
      </aside>
    </div>
  );
}
