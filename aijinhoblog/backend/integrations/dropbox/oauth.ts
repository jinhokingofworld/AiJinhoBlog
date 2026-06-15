import { createJwt, verifyJwt } from "@/backend/auth/crypto";
import { RetryableRequestError, fetchJsonWithRetry } from "@/backend/ai/http";
import "@/backend/core/env";

const DROPBOX_OAUTH_AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_OAUTH_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const DEFAULT_DROPBOX_SCOPES = "files.metadata.read files.content.read";
const DROPBOX_STATE_TTL_MS = 1000 * 60 * 10;

export type DropboxOAuthStatePayload = {
  returnTo: string | null;
};

export class DropboxOAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DropboxOAuthConfigError";
  }
}

export class DropboxOAuthError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "DropboxOAuthError";
    this.status = status;
  }
}

type DropboxTokenResponse = {
  access_token?: string;
  account_id?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type DropboxOAuthTokens = {
  accessToken: string;
  accountId: string | null;
  expiresIn: number | null;
  refreshToken: string | null;
  scope: string | null;
};

function getDropboxAppKey() {
  const key = process.env.DROPBOX_APP_KEY;

  if (!key) {
    throw new DropboxOAuthConfigError("DROPBOX_APP_KEY 설정이 필요합니다.");
  }

  return key;
}

function getDropboxAppSecret() {
  const secret = process.env.DROPBOX_APP_SECRET;

  if (!secret) {
    throw new DropboxOAuthConfigError("DROPBOX_APP_SECRET 설정이 필요합니다.");
  }

  return secret;
}

export function getDropboxOAuthRedirectUri(origin?: string) {
  const configured = process.env.DROPBOX_OAUTH_REDIRECT_URI;

  if (configured) {
    return configured;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;

  if (!baseUrl) {
    throw new DropboxOAuthConfigError(
      "DROPBOX_OAUTH_REDIRECT_URI 또는 NEXT_PUBLIC_APP_URL 설정이 필요합니다.",
    );
  }

  return `${baseUrl.replace(/\/$/, "")}/api/me/connections/dropbox/callback`;
}

function getDropboxScopes() {
  return process.env.DROPBOX_OAUTH_SCOPES ?? DEFAULT_DROPBOX_SCOPES;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function createDropboxOAuthState(
  ownerId: string,
  options: {
    returnTo?: string | null;
  } = {},
) {
  return createJwt(
    {
      returnTo: options.returnTo ?? null,
      sub: ownerId,
      type: "dropbox_oauth_state",
    },
    new Date(Date.now() + DROPBOX_STATE_TTL_MS),
  );
}

export function readDropboxOAuthState(
  state: string,
  ownerId: string,
): DropboxOAuthStatePayload | null {
  const payload = verifyJwt(state);

  if (payload?.type !== "dropbox_oauth_state" || payload.sub !== ownerId) {
    return null;
  }

  return {
    returnTo: readString(payload.returnTo),
  };
}

export function verifyDropboxOAuthState(state: string, ownerId: string) {
  return readDropboxOAuthState(state, ownerId) !== null;
}

export function createDropboxOAuthAuthorizeUrl({
  origin,
  state,
}: {
  origin?: string;
  state: string;
}) {
  const url = new URL(DROPBOX_OAUTH_AUTHORIZE_URL);

  url.searchParams.set("client_id", getDropboxAppKey());
  url.searchParams.set("redirect_uri", getDropboxOAuthRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", getDropboxScopes());
  url.searchParams.set("state", state);
  url.searchParams.set("token_access_type", "offline");

  return url.toString();
}

function createBasicAuthHeader() {
  return `Basic ${Buffer.from(`${getDropboxAppKey()}:${getDropboxAppSecret()}`).toString(
    "base64",
  )}`;
}

function toOAuthTokens(data: DropboxTokenResponse): DropboxOAuthTokens {
  if (!data.access_token) {
    throw new DropboxOAuthError("Dropbox access token 응답이 비어 있습니다.");
  }

  return {
    accessToken: data.access_token,
    accountId: data.account_id ?? null,
    expiresIn: data.expires_in ?? null,
    refreshToken: data.refresh_token ?? null,
    scope: data.scope ?? null,
  };
}

export async function exchangeDropboxOAuthCode({
  code,
  origin,
}: {
  code: string;
  origin?: string;
}) {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: getDropboxOAuthRedirectUri(origin),
  });

  try {
    const result = await fetchJsonWithRetry<DropboxTokenResponse>(
      DROPBOX_OAUTH_TOKEN_URL,
      {
        method: "POST",
        headers: {
          Authorization: createBasicAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
      {
        timeoutMs: 10_000,
        totalAttempts: 2,
      },
    );

    return toOAuthTokens(result.data ?? {});
  } catch (error) {
    if (error instanceof RetryableRequestError) {
      throw new DropboxOAuthError(error.message, error.status);
    }

    throw error;
  }
}

export async function refreshDropboxOAuthToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  try {
    const result = await fetchJsonWithRetry<DropboxTokenResponse>(
      DROPBOX_OAUTH_TOKEN_URL,
      {
        method: "POST",
        headers: {
          Authorization: createBasicAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
      {
        timeoutMs: 10_000,
        totalAttempts: 2,
      },
    );

    return toOAuthTokens(result.data ?? {});
  } catch (error) {
    if (error instanceof RetryableRequestError) {
      throw new DropboxOAuthError(error.message, error.status);
    }

    throw error;
  }
}
