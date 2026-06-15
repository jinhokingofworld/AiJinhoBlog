import {
  attachRefreshedSessionCookie,
  failWithRefreshedSession,
  getCurrentUserOrRefresh,
} from "@/backend/auth/session";
import {
  DropboxAccessTokenMissingError,
  DropboxConnectorError,
  createDropboxMarkdownClient,
} from "@/backend/integrations/dropbox/client";
import { syncDropboxMarkdownDocuments } from "@/backend/integrations/dropbox/indexing";
import {
  ExternalConnectionRequiredError,
  getDropboxConnectionAccessToken,
  markExternalConnectionError,
  markExternalConnectionOperationError,
  markExternalConnectionSynced,
} from "@/backend/integrations/external-connections";
import { fail, json, readJson } from "@/backend/core/http";
import { enforceAiRateLimit, toRateLimitResponse } from "@/backend/ai/rate-limit";

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

function isDropboxConnectionError(error: unknown) {
  return (
    error instanceof DropboxAccessTokenMissingError ||
    error instanceof ExternalConnectionRequiredError ||
    (error instanceof DropboxConnectorError && error.status === 401)
  );
}

export async function POST(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const options = parseSyncPayload(await readJson(request));

  try {
    await enforceAiRateLimit({
      endpoint: "dropbox.markdown.sync",
      userId: user.id,
    });
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
    const rateLimit = toRateLimitResponse(error);

    if (rateLimit) {
      return failWithRefreshedSession(rateLimit.message, auth, rateLimit.status);
    }

    if (isDropboxConnectionError(error) && !(error instanceof ExternalConnectionRequiredError)) {
      await markExternalConnectionError(user.id, "DROPBOX", error);
    } else if (!(error instanceof ExternalConnectionRequiredError)) {
      await markExternalConnectionOperationError(user.id, "DROPBOX", error);
    }

    const response = toDropboxSyncErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
