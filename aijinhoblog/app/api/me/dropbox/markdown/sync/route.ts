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

// POST /api/me/dropbox/markdown/sync
// 연결된 Dropbox 계정의 Markdown 파일을 DB와 ChromaDB 벡터로 동기화하는 API입니다.
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
    // 실전 구현 포인트: 전역 DROPBOX_ACCESS_TOKEN이 아니라 로그인 사용자(ownerId)의 저장된 연결에서 token을 가져옵니다.
    const accessToken = await getDropboxConnectionAccessToken(user.id);
    // Dropbox 파일 읽기와 문서별 embedding/Chroma upsert는 indexing 계층이 처리합니다.
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
