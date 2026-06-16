"use client"; //useState와 같은것들을 사용하기 위해서는 use Client

import Link from "next/link"; //내장 라우팅 컴포넌트를 가져오는 것
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

//TypeScript 타입 설명서, 모양만 정의한 것
//이런 타입은 여러 곳에서 반복될 가능성이 높아서 공유타입을 두는 것이 좋다
//공유파일은 어디서 import해도 좋은 중립 파일에 놓는게 좋다. export를 붙이면 된다
type User = { 
  id: string;
  email: string;
  username: string;
  name: string;
};

// 로그인 페이지에서 공통으로 쓰는 JSON 요청 함수입니다.
// fetch 응답이 실패 상태이면 API가 내려준 error 메시지를 Error로 바꿔서 호출부의 catch로 넘깁니다.
async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  //이 data는 호출자가 기대한 T 모양이면서, 실패 응답일 경우 error라는 문자열 필드가 있을 수도 있다.
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
  }

  return data;
}

// 이 파일의 메인 React 컴포넌트입니다.
// app/login/page.tsx 경로 때문에 Next.js가 /login 요청에 대해 이 컴포넌트를 화면으로 렌더링합니다.
export default function LoginPage() {
  // App Router에서 화면 이동을 코드로 처리할 때 쓰는 Next.js 훅입니다.
  const router = useRouter();

  // input value를 React state로 관리하는 controlled form입니다.
  // 사용자가 입력할 때마다 form state가 바뀌고, submit 시점에는 이 값이 API 요청 body가 됩니다.
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  // 회원가입 직후 /login?created=1 같은 URL로 들어오면 안내 메시지를 처음부터 보여줍니다.
  // window는 브라우저에만 있으므로 서버 렌더링 중에는 접근하지 않도록 typeof로 보호합니다.
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(window.location.search).get("created")
      ? "회원가입이 완료되었습니다. 로그인해 주세요."
      : "";
  });
  const [loading, setLoading] = useState(false);

  // 페이지가 브라우저에 처음 뜬 뒤 이미 로그인된 사용자인지 확인합니다.
  // 로그인 상태라면 로그인 폼을 보여줄 필요가 없으므로 자신의 블로그 페이지로 이동시킵니다.
  useEffect(() => {
    void requestJson<{ user: User | null }>("/api/auth/me")
      .then((data) => {
        if (data.user) {
          router.replace(`/${data.user.username}`);
        }
      })
      .catch(() => null);
  }, [router]);

  // 로그인 폼 제출 흐름입니다.
  // 기본 HTML form 제출은 페이지를 새로고침하므로 막고, fetch로 로그인 API를 호출합니다.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      // /api/auth/login은 이메일/비밀번호를 검증하고 성공 시 세션 쿠키를 응답에 붙입니다.
      const data = await requestJson<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });

      // router.replace는 브라우저 히스토리에 /login을 남기지 않고 블로그 화면으로 바꿉니다.
      // 그래서 로그인 뒤 뒤로 가기를 눌러도 보통 로그인 폼으로 되돌아가지 않습니다.
      router.replace(`/${data.user.username}`);
    } catch (error) {
      // requestJson에서 throw한 API 에러 메시지를 사용자에게 보여줍니다.
      setMessage(error instanceof Error ? error.message : "로그인 실패");
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
        <h1 className="mt-4 text-2xl font-semibold tracking-normal">로그인</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">내 블로그를 관리하려면 로그인하세요.</p>

        {message ? (
          <p className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {message}
          </p>
        ) : null}

        {/* onSubmit이 위의 handleSubmit 함수와 연결되어 로그인 API 호출 흐름을 시작합니다. */}
        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-zinc-700">
            이메일
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700"
              type="email"
              value={form.email}
              // 입력값을 state에 반영해야 submit 시점의 form.email이 최신 값이 됩니다.
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
            // 로그인 요청 중에는 중복 제출을 막기 위해 버튼을 비활성화합니다.
            disabled={loading}
          >
            로그인
          </button>
        </form>

        <p className="mt-5 text-sm text-zinc-600">
          계정이 없다면{" "}
          <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/signup">
            회원가입
          </Link>
        </p>
      </section>
    </main>
  );
}
