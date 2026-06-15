"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import type { SerializedAccount } from "@/backend/users/account-settings";

type Props = {
  initialAccount: SerializedAccount;
};

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
  }

  return data;
}

export function AccountSettingsClient({ initialAccount }: Props) {
  const [account, setAccount] = useState(initialAccount);
  const [accountForm, setAccountForm] = useState({
    currentPassword: "",
    email: initialAccount.email,
    name: initialAccount.name,
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    newPasswordConfirm: "",
  });
  const [accountMessage, setAccountMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const accountChanged = accountForm.email !== account.email || accountForm.name !== account.name;

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAccount(true);
    setAccountMessage("");

    try {
      const result = await requestJson<{ account: SerializedAccount }>("/api/me/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(accountForm),
      });

      setAccount(result.account);
      setAccountForm({
        currentPassword: "",
        email: result.account.email,
        name: result.account.name,
      });
      setAccountMessage("계정 정보를 저장했습니다.");
    } catch (error) {
      setAccountMessage(
        error instanceof Error ? error.message : "계정 정보를 저장하지 못했습니다.",
      );
    } finally {
      setSavingAccount(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordMessage("");

    try {
      await requestJson<{ ok: true }>("/api/me/account/password", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(passwordForm),
      });

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        newPasswordConfirm: "",
      });
      setPasswordMessage("비밀번호를 변경했습니다.");
    } catch (error) {
      setPasswordMessage(
        error instanceof Error ? error.message : "비밀번호를 변경하지 못했습니다.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">AiJinhoBlog</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">계정 설정</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            로그인 계정 정보와 비밀번호를 관리합니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            className="border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${account.username}/settings`}
          >
            블로그 설정
          </Link>
          <Link
            className="border border-zinc-300 px-3 py-2 text-center text-sm font-medium hover:bg-zinc-100"
            href={`/${account.username}`}
          >
            블로그 홈
          </Link>
        </div>
      </div>

      <section className="mt-6 border border-zinc-300 bg-white p-5">
        <h2 className="text-base font-semibold">계정 정보</h2>
        <p className="mt-2 text-sm text-zinc-600">
          username은 블로그 주소에 사용되므로 여기서는 변경하지 않습니다.
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="font-medium text-zinc-600">username</dt>
          <dd className="break-all text-zinc-900">{account.username}</dd>
        </dl>

        {accountMessage ? (
          <p className="mt-4 border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {accountMessage}
          </p>
        ) : null}

        <form className="mt-5 space-y-4" onSubmit={saveAccount}>
          <label className="block text-sm font-medium text-zinc-700">
            이름
            <input
              className="mt-1 w-full border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
              maxLength={80}
              minLength={2}
              onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
              required
              value={accountForm.name}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            이메일
            <input
              className="mt-1 w-full border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
              onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })}
              required
              type="email"
              value={accountForm.email}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            현재 비밀번호
            <input
              autoComplete="current-password"
              className="mt-1 w-full border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
              disabled={!accountChanged}
              onChange={(event) =>
                setAccountForm({ ...accountForm, currentPassword: event.target.value })
              }
              placeholder="이메일을 변경할 때 필요합니다."
              type="password"
              value={accountForm.currentPassword}
            />
          </label>
          <div className="flex justify-end">
            <button
              className="bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-300"
              disabled={savingAccount || !accountChanged}
              type="submit"
            >
              {savingAccount ? "저장 중" : "계정 정보 저장"}
            </button>
          </div>
        </form>
      </section>

      <form
        className="mt-6 space-y-4 border border-zinc-300 bg-white p-5"
        onSubmit={changePassword}
      >
        <div>
          <h2 className="text-base font-semibold">비밀번호 변경</h2>
          <p className="mt-2 text-sm text-zinc-600">
            새 비밀번호는 8자 이상이어야 하며 현재 비밀번호와 달라야 합니다.
          </p>
        </div>

        {passwordMessage ? (
          <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {passwordMessage}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-zinc-700">
          현재 비밀번호
          <input
            autoComplete="current-password"
            className="mt-1 w-full border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
            }
            required
            type="password"
            value={passwordForm.currentPassword}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          새 비밀번호
          <input
            autoComplete="new-password"
            className="mt-1 w-full border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
            minLength={8}
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, newPassword: event.target.value })
            }
            required
            type="password"
            value={passwordForm.newPassword}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-700">
          새 비밀번호 확인
          <input
            autoComplete="new-password"
            className="mt-1 w-full border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-700"
            minLength={8}
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, newPasswordConfirm: event.target.value })
            }
            required
            type="password"
            value={passwordForm.newPasswordConfirm}
          />
        </label>
        <div className="flex justify-end">
          <button
            className="bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:bg-zinc-300"
            disabled={savingPassword}
            type="submit"
          >
            {savingPassword ? "변경 중" : "비밀번호 변경"}
          </button>
        </div>
      </form>
    </div>
  );
}
