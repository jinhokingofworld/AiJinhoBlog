"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Folder = {
  id: string;
  name: string;
  position: number;
  isDefault: boolean;
  postCount: number;
};

type Props = {
  username: string;
  initialFolders: Folder[];
};

function createNameState(folders: Folder[]) {
  return Object.fromEntries(folders.map((folder) => [folder.id, folder.name]));
}

export function FolderSettingsClient({ username, initialFolders }: Props) {
  const [folders, setFolders] = useState(initialFolders);
  const [names, setNames] = useState<Record<string, string>>(() => createNameState(initialFolders));
  const [newName, setNewName] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const targetOptions = useMemo(() => {
    return Object.fromEntries(
      folders.map((folder) => [
        folder.id,
        folders.filter((candidate) => candidate.id !== folder.id),
      ]),
    ) as Record<string, Folder[]>;
  }, [folders]);

  function applyFolders(nextFolders: Folder[]) {
    setFolders(nextFolders);
    setNames(createNameState(nextFolders));
    setTargets({});
  }

  async function readFolderResponse(response: Response) {
    const result = (await response.json()) as {
      folder?: Folder;
      folders?: Folder[];
      error?: string;
    };

    if (!response.ok) {
      setMessage(result.error ?? "폴더 작업에 실패했습니다.");
      return false;
    }

    if (result.folders) {
      applyFolders(result.folders);
    } else if (result.folder) {
      applyFolders([...folders, result.folder].sort((a, b) => a.position - b.position));
    }

    setMessage("저장했습니다.");
    return true;
  }

  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/me/folders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    });
    const ok = await readFolderResponse(response);

    if (ok) {
      setNewName("");
    }

    setSaving(false);
  }

  async function updateFolderName(folderId: string) {
    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/me/folders/${folderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: names[folderId] }),
    });

    await readFolderResponse(response);
    setSaving(false);
  }

  async function moveFolder(folderId: string, direction: "up" | "down") {
    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/me/folders/${folderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ direction }),
    });

    await readFolderResponse(response);
    setSaving(false);
  }

  async function deleteFolder(folderId: string, mode: "move" | "delete-posts") {
    if (mode === "delete-posts" && !window.confirm("폴더 안의 게시글도 함께 삭제하시겠습니까?")) {
      return;
    }

    const targetFolderId = targets[folderId] ?? targetOptions[folderId]?.[0]?.id ?? "";
    const params = new URLSearchParams({ mode });

    if (mode === "move") {
      params.set("targetFolderId", targetFolderId);
    }

    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/me/folders/${folderId}?${params.toString()}`, {
      method: "DELETE",
    });

    await readFolderResponse(response);
    setSaving(false);
  }

  async function mergeFolder(folderId: string) {
    const targetFolderId = targets[folderId] ?? targetOptions[folderId]?.[0]?.id ?? "";

    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/me/folders/${folderId}/merge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetFolderId }),
    });

    await readFolderResponse(response);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          className="border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          href={`/${username}`}
        >
          블로그로
        </Link>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={createFolder}>
        <label className="sr-only" htmlFor="new-folder-name">
          새 폴더 이름
        </label>
        <input
          className="min-w-0 flex-1 border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
          id="new-folder-name"
          maxLength={80}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="새 폴더 이름"
          required
          value={newName}
        />
        <button
          className="bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          disabled={saving}
          type="submit"
        >
          폴더 생성
        </button>
      </form>

      <div className="space-y-4">
        {folders.map((folder, index) => {
          const options = targetOptions[folder.id] ?? [];
          const targetValue = targets[folder.id] ?? options[0]?.id ?? "";

          return (
            <section className="border border-zinc-300 p-4" key={folder.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {folder.isDefault ? (
                      <span className="border border-teal-200 bg-teal-50 px-2 py-1 text-xs text-teal-800">
                        기본
                      </span>
                    ) : null}
                    <span className="text-xs text-zinc-500">글 {folder.postCount}개</span>
                  </div>
                  <label className="sr-only" htmlFor={`folder-name-${folder.id}`}>
                    폴더 이름
                  </label>
                  <input
                    className="w-full border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-950"
                    id={`folder-name-${folder.id}`}
                    maxLength={80}
                    onChange={(event) =>
                      setNames((current) => ({
                        ...current,
                        [folder.id]: event.target.value,
                      }))
                    }
                    value={names[folder.id] ?? folder.name}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
                    disabled={saving}
                    onClick={() => void updateFolderName(folder.id)}
                    type="button"
                  >
                    이름 변경
                  </button>
                  <button
                    className="border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 disabled:text-zinc-300"
                    disabled={saving || index === 0}
                    onClick={() => void moveFolder(folder.id, "up")}
                    type="button"
                  >
                    위
                  </button>
                  <button
                    className="border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 disabled:text-zinc-300"
                    disabled={saving || index === folders.length - 1}
                    onClick={() => void moveFolder(folder.id, "down")}
                    type="button"
                  >
                    아래
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                <label className="sr-only" htmlFor={`target-folder-${folder.id}`}>
                  대상 폴더
                </label>
                <select
                  className="border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-950"
                  disabled={options.length === 0}
                  id={`target-folder-${folder.id}`}
                  onChange={(event) =>
                    setTargets((current) => ({
                      ...current,
                      [folder.id]: event.target.value,
                    }))
                  }
                  value={targetValue}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <button
                  className="border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 disabled:text-zinc-300"
                  disabled={saving || options.length === 0}
                  onClick={() => void deleteFolder(folder.id, "move")}
                  type="button"
                >
                  이동 후 삭제
                </button>
                <button
                  className="border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 disabled:text-zinc-300"
                  disabled={saving || options.length === 0}
                  onClick={() => void mergeFolder(folder.id)}
                  type="button"
                >
                  병합
                </button>
                <button
                  className="border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:text-zinc-300"
                  disabled={saving || options.length === 0}
                  onClick={() => void deleteFolder(folder.id, "delete-posts")}
                  type="button"
                >
                  글까지 삭제
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {message ? (
        <p className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {message}
        </p>
      ) : null}
    </div>
  );
}
