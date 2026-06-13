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
import { fail, json } from "@/backend/http";

export const runtime = "nodejs";

function toDropboxErrorResponse(error: unknown) {
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
    message: "Dropbox Markdown 파일을 읽지 못했습니다.",
    status: 502,
  };
}

export async function GET(request: Request) {
  const auth = await getCurrentUserOrRefresh();
  const user = auth.user;

  if (!user) {
    return fail("로그인이 필요합니다.", 401);
  }

  const path = new URL(request.url).searchParams.get("path");

  if (!path) {
    return failWithRefreshedSession("Dropbox Markdown 파일 경로가 필요합니다.", auth, 400);
  }

  try {
    const file = await createDropboxMarkdownClient().readMarkdownFile(path);
    const response = json(file);

    return attachRefreshedSessionCookie(response, auth);
  } catch (error) {
    const response = toDropboxErrorResponse(error);

    return failWithRefreshedSession(response.message, auth, response.status);
  }
}
