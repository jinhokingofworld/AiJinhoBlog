"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

// 회원가입 페이지에서 공통으로 쓰는 JSON 요청 함수입니다.
// API 응답이 실패 상태이면 서버가 내려준 error 메시지를 Error로 바꿔 submit 흐름의 catch로 넘깁니다.
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

// 이 파일의 메인 React 컴포넌트입니다.
// app/signup/page.tsx 경로 때문에 Next.js가 /signup 요청에 대해 이 컴포넌트를 화면으로 렌더링합니다.
export default function SignupPage() {
  // App Router에서 코드로 페이지 이동을 시킬 때 사용하는 Next.js 훅입니다.
  const router = useRouter();

  // 회원가입 input 값을 React state로 관리하는 controlled form입니다.
  // submit 시점에는 이 form 객체가 그대로 /api/auth/signup 요청 body가 됩니다.
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
  });

  // API 검증 실패나 중복 이메일/username 오류를 화면에 보여주기 위한 상태입니다.
  const [message, setMessage] = useState("");

  // 회원가입 요청 중 버튼을 비활성화해서 중복 제출을 막기 위한 상태입니다.
  const [loading, setLoading] = useState(false);

  // 회원가입 폼 제출 흐름입니다.
  // 기본 HTML form 제출은 페이지를 새로고침하므로 막고, fetch로 회원가입 API를 호출합니다.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      // /api/auth/signup은 입력값 검증, 이메일/username 중복 확인, 비밀번호 해시 저장을 처리합니다.
      await requestJson<{ user: { id: string } }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(form),
      });

      // 회원가입 성공 후 로그인 페이지로 보냅니다.
      // created=1 쿼리는 로그인 페이지에서 "회원가입 완료" 안내 메시지를 띄우는 신호로 사용됩니다.
      router.replace("/login?created=1");
    } catch (error) {
      // requestJson에서 throw한 API 에러 메시지를 사용자에게 보여줍니다.
      setMessage(error instanceof Error ? error.message : "회원가입 실패");
    } finally {
      // 성공/실패와 관계없이 버튼 disabled 상태를 해제합니다.
      setLoading(false);
    }
  }

  // return 안쪽은 실제 화면 구조(JSX)입니다.
  // 대문자로 시작하는 Link는 Next.js 컴포넌트이고, main/section/form/input은 HTML 태그입니다.
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f7f4] px-5 py-10 text-zinc-950">
      <section className="w-full max-w-sm">
        <Link className="text-sm font-semibold text-teal-700" href="/">
          AiJinhoBlog
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-normal">회원가입</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">username은 블로그 주소에 사용됩니다.</p>

        {message ? (
          <p className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {message}
          </p>
        ) : null}

        {/* onSubmit이 위의 handleSubmit 함수와 연결되어 회원가입 API 호출 흐름을 시작합니다. */}
        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-zinc-700">
            이름
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700"
              value={form.name}
              // 입력값을 state에 반영해야 submit 시점의 form.name이 최신 값이 됩니다.
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            username
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700"
              value={form.username}
              // username은 가입 후 블로그 주소 /[username]에 사용되므로 서버에서도 중복 검사를 합니다.
              onChange={(event) => setForm({ ...form, username: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            이메일
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            비밀번호
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </label>
          <button
            className="w-full rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            // 회원가입 요청 중에는 중복 제출을 막기 위해 버튼을 비활성화합니다.
            disabled={loading}
          >
            회원가입
          </button>
        </form>

        <p className="mt-5 text-sm text-zinc-600">
          이미 계정이 있다면{" "}
          <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/login">
            로그인
          </Link>
        </p>
      </section>
    </main>
  );
}
