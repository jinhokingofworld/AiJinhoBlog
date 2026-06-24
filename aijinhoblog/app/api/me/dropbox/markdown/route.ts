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
import {
  ExternalConnectionRequiredError,
  getDropboxConnectionAccessToken,
} from "@/backend/integrations/external-connections";
import { fail, json } from "@/backend/core/http";

export const runtime = "nodejs";

function toDropboxErrorResponse(error: unknown) {
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
    message: "Dropbox Markdown 목록을 불러오지 못했습니다.",
    status: 502,
  };
}

export async function GET(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const searchParams = new URL(request.url).searchParams;
  const path = searchParams.get("path") ?? "";
  const recursive = searchParams.get("recursive") !== "false";

  try {
    const accessToken = await getDropboxConnectionAccessToken(user.id);
    const files = await createDropboxMarkdownClient({ accessToken }).listMarkdownFiles({
      path,
      recursive,
    });
    const response = json({
      files,
    });

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    const response = toDropboxErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
