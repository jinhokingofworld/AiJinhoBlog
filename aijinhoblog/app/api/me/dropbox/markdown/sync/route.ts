import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth";
import {
  DropboxAccessTokenMissingError,
  DropboxConnectorError,
  createDropboxMarkdownClient,
} from "@/backend/dropbox";
import { syncDropboxMarkdownDocuments } from "@/backend/dropbox-indexing";
import {
  ExternalConnectionRequiredError,
  getDropboxConnectionAccessToken,
  markExternalConnectionError,
  markExternalConnectionSynced,
} from "@/backend/external-connections";
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
  if (error instanceof ExternalConnectionRequiredError) {
    return {
      message: "Dropbox 연결이 필요합니다.",
      status: 409,
    };
  }

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
          ? "Dropbox 인증에 실패했습니다. Dropbox를 다시 연결해주세요."
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
    const accessToken = await getDropboxConnectionAccessToken(user.id);
    const sync = await syncDropboxMarkdownDocuments(user.id, options, {
      dropboxClient: createDropboxMarkdownClient({ accessToken }),
    });

    await markExternalConnectionSynced(user.id, "DROPBOX");

    const response = json({
      sync,
    });

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    if (!(error instanceof ExternalConnectionRequiredError)) {
      await markExternalConnectionError(user.id, "DROPBOX", error);
    }

    const response = toDropboxSyncErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
