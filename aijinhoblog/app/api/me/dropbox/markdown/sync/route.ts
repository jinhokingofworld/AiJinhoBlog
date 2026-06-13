import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import { DropboxAccessTokenMissingError, DropboxConnectorError } from "@/backend/dropbox";
import { syncDropboxMarkdownDocuments } from "@/backend/dropbox-indexing";
import { fail, json, readJson } from "@/backend/http";

export const runtime = "nodejs";

type SyncPayload = {
  path?: unknown;
  recursive?: unknown;
};

function parseSyncPayload(payload: unknown) {
  const value = (payload ?? {}) as SyncPayload;

  return {
    path: typeof value.path === "string" ? value.path : "",
    recursive: typeof value.recursive === "boolean" ? value.recursive : true,
  };
}

function toDropboxSyncErrorResponse(error: unknown) {
  if (error instanceof DropboxAccessTokenMissingError) {
    return {
      message: error.message,
      status: 500,
    };
  }

  if (error instanceof DropboxConnectorError) {
    return {
      message:
        error.status === 401
          ? "Dropbox 인증에 실패했습니다. DROPBOX_ACCESS_TOKEN 값을 확인해주세요."
          : error.message,
      status: error.status && error.status >= 400 && error.status < 500 ? 400 : 502,
    };
  }

  return {
    message:
      error instanceof Error ? error.message : "Dropbox Markdown 문서 동기화에 실패했습니다.",
    status: 502,
  };
}

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const options = parseSyncPayload(await readJson(request));

  try {
    const sync = await syncDropboxMarkdownDocuments(user.id, options);
    const response = json({
      sync,
    });

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    const response = toDropboxSyncErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
