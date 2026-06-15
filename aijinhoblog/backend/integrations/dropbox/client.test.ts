import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DropboxAccessTokenMissingError,
  DropboxConnectorError,
  createDropboxMarkdownClient,
} from "@/backend/integrations/dropbox/client";

const originalFetch = globalThis.fetch;
const originalToken = process.env.DROPBOX_ACCESS_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.DROPBOX_ACCESS_TOKEN = originalToken;
  vi.restoreAllMocks();
});

describe("createDropboxMarkdownClient", () => {
  it("lists markdown files and ignores non-markdown entries", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          cursor: "cursor-1",
          has_more: false,
          entries: [
            {
              ".tag": "file",
              id: "id:md",
              name: "note.md",
              path_display: "/docs/note.md",
              path_lower: "/docs/note.md",
              rev: "rev-1",
              server_modified: "2026-06-13T01:00:00Z",
              size: 120,
            },
            {
              ".tag": "file",
              id: "id:txt",
              name: "note.txt",
              path_display: "/docs/note.txt",
              path_lower: "/docs/note.txt",
            },
            {
              ".tag": "folder",
              id: "id:folder",
              name: "docs",
              path_display: "/docs",
              path_lower: "/docs",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;

    const files = await createDropboxMarkdownClient({
      accessToken: "token",
      apiUrl: "https://dropbox.test",
    }).listMarkdownFiles({ path: "docs" });

    expect(files).toEqual([
      {
        id: "id:md",
        name: "note.md",
        pathDisplay: "/docs/note.md",
        pathLower: "/docs/note.md",
        rev: "rev-1",
        serverModified: "2026-06-13T01:00:00Z",
        size: 120,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dropbox.test/2/files/list_folder",
      expect.objectContaining({
        body: JSON.stringify({
          path: "/docs",
          recursive: true,
          include_deleted: false,
          include_non_downloadable_files: false,
        }),
      }),
    );
  });

  it("continues listing while Dropbox returns more pages", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cursor: "cursor-1",
            has_more: true,
            entries: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cursor: "cursor-2",
            has_more: false,
            entries: [
              {
                ".tag": "file",
                id: "id:md",
                name: "next.markdown",
                path_display: "/next.markdown",
                path_lower: "/next.markdown",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    globalThis.fetch = fetchMock;

    const files = await createDropboxMarkdownClient({
      accessToken: "token",
      apiUrl: "https://dropbox.test",
    }).listMarkdownFiles();

    expect(files).toHaveLength(1);
    expect(files[0]?.pathDisplay).toBe("/next.markdown");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reads markdown file content with metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("# Dropbox Note", {
        status: 200,
        headers: {
          "dropbox-api-result": JSON.stringify({
            ".tag": "file",
            id: "id:md",
            name: "note.md",
            path_display: "/docs/note.md",
            path_lower: "/docs/note.md",
            rev: "rev-1",
            server_modified: "2026-06-13T01:00:00Z",
            size: 15,
          }),
        },
      }),
    );
    globalThis.fetch = fetchMock;

    const result = await createDropboxMarkdownClient({
      accessToken: "token",
      contentUrl: "https://content.dropbox.test",
    }).readMarkdownFile("docs/note.md");

    expect(result.content).toBe("# Dropbox Note");
    expect(result.file.pathDisplay).toBe("/docs/note.md");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://content.dropbox.test/2/files/download",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Dropbox-API-Arg": JSON.stringify({
            path: "/docs/note.md",
          }),
        }),
        method: "POST",
      }),
    );
  });

  it("escapes non-ASCII characters in Dropbox download headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("# Korean Dropbox Note", {
        status: 200,
        headers: {
          "dropbox-api-result":
            '{".tag":"file","id":"id:korean","name":"\\uc120\\ud0dd.md","path_display":"/\\uc0bc\\uc131 \\ub178\\ud2b8/\\uc120\\ud0dd.md","path_lower":"/\\uc0bc\\uc131 \\ub178\\ud2b8/\\uc120\\ud0dd.md"}',
        },
      }),
    );
    globalThis.fetch = fetchMock;

    await createDropboxMarkdownClient({
      accessToken: "token",
      contentUrl: "https://content.dropbox.test",
    }).readMarkdownFile("/삼성 노트/선택.md");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(headers["Dropbox-API-Arg"]).toBe(
      '{"path":"/\\uc0bc\\uc131 \\ub178\\ud2b8/\\uc120\\ud0dd.md"}',
    );
    expect(headers["Dropbox-API-Arg"]).not.toContain("선택");
  });

  it("requires an access token", async () => {
    process.env.DROPBOX_ACCESS_TOKEN = "";

    await expect(createDropboxMarkdownClient().listMarkdownFiles()).rejects.toBeInstanceOf(
      DropboxAccessTokenMissingError,
    );
  });

  it("rejects non-markdown downloads", async () => {
    await expect(
      createDropboxMarkdownClient({ accessToken: "token" }).readMarkdownFile("/docs/note.txt"),
    ).rejects.toMatchObject<Partial<DropboxConnectorError>>({
      message: "Markdown 파일만 읽을 수 있습니다.",
      operation: "download",
    });
  });
});
