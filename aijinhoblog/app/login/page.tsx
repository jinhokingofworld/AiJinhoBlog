"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  username: string;
  name: string;
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

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [message, setMessage] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(window.location.search).get("created")
      ? "회원가입이 완료되었습니다. 로그인해 주세요."
      : "";
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void requestJson<{ user: User | null }>("/api/auth/me")
      .then((data) => {
        if (data.user) {
          router.replace(`/${data.user.username}`);
        }
      })
      .catch(() => null);
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const data = await requestJson<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });

      router.replace(`/${data.user.username}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

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

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
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
