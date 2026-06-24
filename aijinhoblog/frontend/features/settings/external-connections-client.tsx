"use client";

import { useMemo, useState } from "react";

import type { SerializedExternalConnection } from "@/backend/integrations/external-connections";

type DropboxMarkdownFile = {
  id: string;
  name: string;
  pathDisplay: string;
  pathLower: string;
  rev: string | null;
  serverModified: string | null;
  size: number | null;
};

type Props = {
  initialConnections: SerializedExternalConnection[];
  message?: string | null;
  username: string;
};

function getConnection(
  connections: SerializedExternalConnection[],
  provider: SerializedExternalConnection["provider"],
) {
  return connections.find((connection) => connection.provider === provider) ?? null;
}

export function ExternalConnectionsClient({ initialConnections, message, username }: Props) {
  const [connections, setConnections] = useState(initialConnections);
  const [dropboxFiles, setDropboxFiles] = useState<DropboxMarkdownFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [syncingFiles, setSyncingFiles] = useState(false);
  const [notice, setNotice] = useState(message ?? "");
  const [error, setError] = useState("");
  const dropbox = useMemo(() => getConnection(connections, "DROPBOX"), [connections]);
  const dropboxConnected = dropbox?.status === "CONNECTED";
  const dropboxStartHref = `/api/me/connections/dropbox/start?returnTo=${encodeURIComponent(
    `/${username}/settings/connections`,
  )}`;

  async function readApiJson<T>(response: Response): Promise<T> {
    const text = await response.text();

    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  async function refreshConnections() {
    const response = await fetch("/api/me/connections");
    const result = (await response.json()) as {
      connections?: SerializedExternalConnection[];
      error?: string;
    };

    if (!response.ok || !result.connections) {
      setError(result.error ?? "연결 상태를 불러오지 못했습니다.");
      return;
    }

    setConnections(result.connections);
  }

  function startDropboxConnection() {
    window.location.assign(dropboxStartHref);
  }

  async function disconnectDropbox() {
    setSaving(true);
    setNotice("");
    setError("");

    const response = await fetch("/api/me/connections/dropbox", {
      method: "DELETE",
    });
    const result = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      setError(result.error ?? "Dropbox 연결을 해제하지 못했습니다.");
      setSaving(false);
      return;
    }

    await refreshConnections();
    setDropboxFiles([]);
    setNotice("Dropbox 연결을 해제했습니다.");
    setSaving(false);
  }

  async function loadDropboxFiles() {
    setLoadingFiles(true);
    setNotice("");
    setError("");

    const response = await fetch("/api/me/dropbox/markdown");
    const result = await readApiJson<{
      error?: string;
      files?: DropboxMarkdownFile[];
    }>(response);

    setLoadingFiles(false);

    if (!response.ok || !result.files) {
      setError(result.error ?? "Dropbox Markdown 목록을 불러오지 못했습니다.");
      return;
    }

    setDropboxFiles(result.files);
    setNotice(`Dropbox Markdown ${result.files.length}개를 불러왔습니다.`);
  }

  async function syncDropboxFiles() {
    setSyncingFiles(true);
    setNotice("");
    setError("");

    const response = await fetch("/api/me/dropbox/markdown/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recursive: true,
      }),
    });
    const result = await readApiJson<{
      error?: string;
      sync?: {
        deleted: unknown[];
        failed: unknown[];
        indexed: unknown[];
        skipped: unknown[];
        totalRemoteFiles: number;
      };
    }>(response);

    setSyncingFiles(false);

    if (!response.ok || !result.sync) {
      setError(result.error ?? "Dropbox Markdown을 지식 소스로 등록하지 못했습니다.");
      await refreshConnections();
      return;
    }

    await refreshConnections();
    setNotice(
      `Dropbox Markdown ${result.sync.totalRemoteFiles}개 처리: ${result.sync.indexed.length}개 등록, ${result.sync.skipped.length}개 유지, ${result.sync.deleted.length}개 삭제, ${result.sync.failed.length}개 실패`,
    );
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <p className="border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
            <button
              className="bg-zinc-950 px-3 py-2 text-center text-sm font-medium text-white hover:bg-zinc-800"
              onClick={startDropboxConnection}
              type="button"
            >
              Dropbox 연결
            </button>
            <button
              className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:text-zinc-300"
              disabled={loadingFiles || syncingFiles}
              onClick={() => void loadDropboxFiles()}
              type="button"
            >
              {loadingFiles ? "불러오는 중" : "Markdown 목록 불러오기"}
            </button>
            {dropboxConnected ? (
              <>
                <button
                  className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:text-zinc-300"
                  disabled={loadingFiles || syncingFiles}
                  onClick={() => void syncDropboxFiles()}
                  type="button"
                >
                  {syncingFiles ? "등록 중" : "지식 소스로 등록"}
                </button>
                <button
                  className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:text-zinc-300"
                  disabled={saving || syncingFiles}
                  onClick={() => void disconnectDropbox()}
                  type="button"
                >
                  연결 해제
                </button>
              </>
            ) : null}
          </div>
        </div>

        {dropboxFiles.length ? (
          <div className="mt-4 max-h-80 overflow-y-auto border border-zinc-200">
            {dropboxFiles.map((file) => (
              <div className="border-b border-zinc-200 p-3 last:border-b-0" key={file.id}>
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">{file.pathDisplay}</p>
              </div>
            ))}
          </div>
        ) : null}
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
