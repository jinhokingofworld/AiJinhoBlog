"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { SerializedExternalConnection } from "@/backend/external-connections";

type Props = {
  initialConnections: SerializedExternalConnection[];
  message?: string | null;
};

function getConnection(
  connections: SerializedExternalConnection[],
  provider: SerializedExternalConnection["provider"],
) {
  return connections.find((connection) => connection.provider === provider) ?? null;
}

export function ExternalConnectionsClient({ initialConnections, message }: Props) {
  const [connections, setConnections] = useState(initialConnections);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(message ?? "");
  const dropbox = useMemo(() => getConnection(connections, "DROPBOX"), [connections]);
  const dropboxConnected = dropbox?.status === "CONNECTED";

  async function refreshConnections() {
    const response = await fetch("/api/me/connections");
    const result = (await response.json()) as {
      connections?: SerializedExternalConnection[];
      error?: string;
    };

    if (!response.ok || !result.connections) {
      setNotice(result.error ?? "연결 상태를 불러오지 못했습니다.");
      return;
    }

    setConnections(result.connections);
  }

  async function disconnectDropbox() {
    setSaving(true);
    setNotice("");

    const response = await fetch("/api/me/connections/dropbox", {
      method: "DELETE",
    });
    const result = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      setNotice(result.error ?? "Dropbox 연결을 해제하지 못했습니다.");
      setSaving(false);
      return;
    }

    await refreshConnections();
    setNotice("Dropbox 연결을 해제했습니다.");
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <p className="border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {notice}
        </p>
      ) : null}

      <section className="border border-zinc-300 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Dropbox</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {dropboxConnected
                ? `${dropbox.providerAccountName ?? "Dropbox 계정"} 연결됨`
                : "연결 안 됨"}
            </p>
            {dropbox?.lastSyncedAt ? (
              <p className="mt-1 text-xs text-zinc-500">
                마지막 동기화 {new Date(dropbox.lastSyncedAt).toLocaleString("ko-KR")}
              </p>
            ) : null}
            {dropbox?.lastError ? (
              <p className="mt-1 text-xs text-red-700">{dropbox.lastError}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {dropboxConnected ? (
              <button
                className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:text-zinc-300"
                disabled={saving}
                onClick={() => void disconnectDropbox()}
                type="button"
              >
                연결 해제
              </button>
            ) : (
              <Link
                className="bg-zinc-950 px-3 py-2 text-center text-sm font-medium text-white hover:bg-zinc-800"
                href="/api/me/connections/dropbox/start"
                prefetch={false}
              >
                Dropbox 연결
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="border border-zinc-300 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Notion</h2>
            <p className="mt-1 text-sm text-zinc-600">준비 중</p>
          </div>
          <button
            className="border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-400"
            disabled
            type="button"
          >
            곧 지원
          </button>
        </div>
      </section>
    </div>
  );
}
