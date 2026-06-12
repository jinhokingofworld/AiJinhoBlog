"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";

type Profile = {
  username: string;
  name: string;
  intro: string;
  blogTitle: string;
  profileImageUrl: string;
  coverImageUrl: string;
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
  }

  return data;
}

export function ProfileSettingsForm({ initialProfile }: { initialProfile: Profile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [form, setForm] = useState({
    intro: initialProfile.intro,
    blogTitle: initialProfile.blogTitle,
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const data = await requestJson<{ profile: Profile }>("/api/me/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      setProfile(data.profile);
      setForm({
        intro: data.profile.intro,
        blogTitle: data.profile.blogTitle,
      });
      setMessage("프로필을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "프로필 저장 실패");
    } finally {
      setLoading(false);
    }
  }

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
    endpoint: "/api/me/profile-image" | "/api/me/cover-image",
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const body = new FormData();
      body.set("image", file);

      const data = await requestJson<{ profile: Profile }>(endpoint, {
        method: "POST",
        body,
      });

      setProfile(data.profile);
      setMessage("이미지를 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "이미지 업로드 실패");
    } finally {
      event.target.value = "";
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">프로필 설정</h1>
        </div>
        <Link
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100"
          href={`/${profile.username}`}
        >
          블로그 홈
        </Link>
      </div>

      {message ? (
        <p className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </p>
      ) : null}

      <section className="mt-6 border border-zinc-300 bg-white p-5">
        <h2 className="text-base font-semibold">이미지</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <Image
              alt={`${profile.name} 프로필 이미지`}
              className="aspect-square w-full border border-zinc-300 bg-zinc-50 object-cover"
              height={180}
              src={profile.profileImageUrl}
              width={180}
            />
            <label className="mt-3 block">
              <span className="sr-only">프로필 이미지 업로드</span>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                disabled={loading}
                type="file"
                onChange={(event) => void handleImageChange(event, "/api/me/profile-image")}
              />
            </label>
          </div>

          <div>
            <div
              className="min-h-44 border border-zinc-300 bg-cover bg-center"
              style={{
                backgroundImage: `linear-gradient(rgba(255,255,255,.28), rgba(255,255,255,.28)), url(${profile.coverImageUrl})`,
              }}
            />
            <label className="mt-3 block">
              <span className="sr-only">커버 이미지 업로드</span>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                disabled={loading}
                type="file"
                onChange={(event) => void handleImageChange(event, "/api/me/cover-image")}
              />
            </label>
          </div>
        </div>
      </section>

      <form className="mt-6 space-y-4 border border-zinc-300 bg-white p-5" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-zinc-700">
          블로그 타이틀
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
            maxLength={80}
            value={form.blogTitle}
            onChange={(event) => setForm({ ...form, blogTitle: event.target.value })}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          소개
          <textarea
            className="mt-1 min-h-24 w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
            maxLength={50}
            value={form.intro}
            onChange={(event) => setForm({ ...form, intro: event.target.value })}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">{form.intro.length}/50</p>
          <button
            className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            disabled={loading}
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
}
