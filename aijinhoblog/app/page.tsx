import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f8f7f4] text-zinc-950">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-16">
        <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-normal text-zinc-950 sm:text-5xl">
          기록을 쌓고 다시 꺼내 읽는 AI 블로그 <br></br>AiJinhoBlog입니다
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-650">
          AiJinhoBlog에서 AI를 활용해서 자신의 기억을 찾고, 글을 작성해보세요!
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            href="/login"
          >
            로그인
          </Link>
          <Link
            className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-100"
            href="/signup"
          >
            회원가입
          </Link>
        </div>
      </section>
    </main>
  );
}
