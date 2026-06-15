import { RetryableRequestError, fetchJsonWithRetry } from "@/backend/ai/http";

const DROPBOX_API_URL = "https://api.dropboxapi.com";
const DROPBOX_CONTENT_URL = "https://content.dropboxapi.com";
const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

type DropboxFileEntry = {
  ".tag": "file";
  id: string;
  name: string;
  path_display?: string;
  path_lower?: string;
  rev?: string;
  server_modified?: string;
  size?: number;
};

type DropboxFolderEntry = {
  ".tag": "folder";
  id: string;
  name: string;
  path_display?: string;
  path_lower?: string;
};

type DropboxDeletedEntry = {
  ".tag": "deleted";
  name: string;
  path_display?: string;
  path_lower?: string;
};

type DropboxListFolderResponse = {
  cursor: string;
  entries: Array<DropboxFileEntry | DropboxFolderEntry | DropboxDeletedEntry>;
  has_more: boolean;
};

type DropboxDownloadMetadata = DropboxFileEntry;

export type DropboxMarkdownFile = {
  id: string;
  name: string;
  pathDisplay: string;
  pathLower: string;
  rev: string | null;
  serverModified: string | null;
  size: number | null;
};

export type DropboxMarkdownContent = {
  content: string;
  file: DropboxMarkdownFile;
};

export class DropboxAccessTokenMissingError extends Error {
  constructor() {
    super("DROPBOX_ACCESS_TOKEN 설정이 필요합니다.");
    this.name = "DropboxAccessTokenMissingError";
  }
}

export class DropboxConnectorError extends Error {
  operation: "download" | "list";
  status?: number;

  constructor(
    message: string,
    options: {
      operation: "download" | "list";
      status?: number;
    },
  ) {
    super(message);
    this.name = "DropboxConnectorError";
    this.operation = options.operation;
    this.status = options.status;
  }
}

function getAccessToken(accessToken?: string) {
  const token = accessToken ?? process.env.DROPBOX_ACCESS_TOKEN ?? "";

  if (!token) {
    throw new DropboxAccessTokenMissingError();
  }

  return token;
}

function isMarkdownFileName(name: string) {
  const lowerName = name.toLowerCase();

  return MARKDOWN_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function normalizeDropboxPath(path: string | null | undefined) {
  const trimmed = path?.trim() ?? "";

  if (!trimmed || trimmed === "/") {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function toMarkdownFile(entry: DropboxFileEntry): DropboxMarkdownFile | null {
  if (!isMarkdownFileName(entry.name) || !entry.path_display || !entry.path_lower) {
    return null;
  }

  return {
    id: entry.id,
    name: entry.name,
    pathDisplay: entry.path_display,
    pathLower: entry.path_lower,
    rev: entry.rev ?? null,
    serverModified: entry.server_modified ?? null,
    size: entry.size ?? null,
  };
}

function createAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function createDropboxApiArgHeader(value: unknown) {
  return JSON.stringify(value).replace(/[^\x20-\x7E]/g, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
}

function createDropboxError(operation: "download" | "list", error: unknown) {
  if (error instanceof DropboxConnectorError || error instanceof DropboxAccessTokenMissingError) {
    return error;
  }

  if (error instanceof RetryableRequestError) {
    return new DropboxConnectorError(error.message, {
      operation,
      status: error.status,
    });
  }

  return new DropboxConnectorError(
    error instanceof Error ? error.message : "Dropbox 요청이 실패했습니다.",
    {
      operation,
    },
  );
}

export function createDropboxMarkdownClient(
  options: {
    accessToken?: string;
    apiUrl?: string;
    contentUrl?: string;
  } = {},
) {
  const apiUrl = options.apiUrl ?? DROPBOX_API_URL;
  const contentUrl = options.contentUrl ?? DROPBOX_CONTENT_URL;

  async function listPage(path: string, recursive: boolean) {
    const accessToken = getAccessToken(options.accessToken);
    const result = await fetchJsonWithRetry<DropboxListFolderResponse>(
      `${apiUrl}/2/files/list_folder`,
      {
        method: "POST",
        headers: createAuthHeaders(accessToken),
        body: JSON.stringify({
          path,
          recursive,
          include_deleted: false,
          include_non_downloadable_files: false,
        }),
      },
      {
        timeoutMs: 10_000,
      },
    );

    return result.data;
  }

  async function listContinue(cursor: string) {
    const accessToken = getAccessToken(options.accessToken);
    const result = await fetchJsonWithRetry<DropboxListFolderResponse>(
      `${apiUrl}/2/files/list_folder/continue`,
      {
        method: "POST",
        headers: createAuthHeaders(accessToken),
        body: JSON.stringify({
          cursor,
        }),
      },
      {
        timeoutMs: 10_000,
      },
    );

    return result.data;
  }

  return {
    async listMarkdownFiles({
      path,
      recursive = true,
    }: {
      path?: string | null;
      recursive?: boolean;
    } = {}) {
      try {
        const markdownFiles: DropboxMarkdownFile[] = [];
        let page = await listPage(normalizeDropboxPath(path), recursive);

        while (page) {
          for (const entry of page.entries) {
            if (entry[".tag"] !== "file") {
              continue;
            }

            const file = toMarkdownFile(entry);

            if (file) {
              markdownFiles.push(file);
            }
          }

          if (!page.has_more) {
            break;
          }

          page = await listContinue(page.cursor);
        }

        return markdownFiles;
      } catch (error) {
        throw createDropboxError("list", error);
      }
    },

    async readMarkdownFile(path: string) {
      const normalizedPath = normalizeDropboxPath(path);

      if (!normalizedPath) {
        throw new DropboxConnectorError("Dropbox Markdown 파일 경로가 필요합니다.", {
          operation: "download",
        });
      }

      if (!isMarkdownFileName(normalizedPath)) {
        throw new DropboxConnectorError("Markdown 파일만 읽을 수 있습니다.", {
          operation: "download",
        });
      }

      try {
        const accessToken = getAccessToken(options.accessToken);
        const response = await fetch(`${contentUrl}/2/files/download`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Dropbox-API-Arg": createDropboxApiArgHeader({
              path: normalizedPath,
            }),
          },
        });
        const metadataHeader = response.headers.get("dropbox-api-result");

        if (!response.ok) {
          const message = await response.text().catch(() => "");

          throw new DropboxConnectorError(
            message || `Dropbox 파일 다운로드에 실패했습니다. status=${response.status}`,
            {
              operation: "download",
              status: response.status,
            },
          );
        }

        if (!metadataHeader) {
          throw new DropboxConnectorError("Dropbox 파일 메타데이터를 확인할 수 없습니다.", {
            operation: "download",
            status: response.status,
          });
        }

        const metadata = JSON.parse(metadataHeader) as DropboxDownloadMetadata;
        const file = toMarkdownFile(metadata);

        if (!file) {
          throw new DropboxConnectorError("Dropbox Markdown 파일 메타데이터가 올바르지 않습니다.", {
            operation: "download",
            status: response.status,
          });
        }

        return {
          content: await response.text(),
          file,
        } satisfies DropboxMarkdownContent;
      } catch (error) {
        throw createDropboxError("download", error);
      }
    },
  };
}
