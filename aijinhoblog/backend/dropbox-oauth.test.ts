import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDropboxOAuthAuthorizeUrl,
  exchangeDropboxOAuthCode,
  refreshDropboxOAuthToken,
} from "@/backend/dropbox-oauth";

const originalFetch = globalThis.fetch;
const originalAppKey = process.env.DROPBOX_APP_KEY;
const originalAppSecret = process.env.DROPBOX_APP_SECRET;
const originalRedirectUri = process.env.DROPBOX_OAUTH_REDIRECT_URI;
const originalScopes = process.env.DROPBOX_OAUTH_SCOPES;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.DROPBOX_APP_KEY = originalAppKey;
  process.env.DROPBOX_APP_SECRET = originalAppSecret;
  process.env.DROPBOX_OAUTH_REDIRECT_URI = originalRedirectUri;
  process.env.DROPBOX_OAUTH_SCOPES = originalScopes;
  vi.restoreAllMocks();
});

describe("Dropbox OAuth", () => {
  it("creates an authorize URL for offline read-only access", () => {
    process.env.DROPBOX_APP_KEY = "app-key";
    process.env.DROPBOX_OAUTH_REDIRECT_URI =
      "https://blog.test/api/me/connections/dropbox/callback";

    const url = new URL(
      createDropboxOAuthAuthorizeUrl({
        state: "state-token",
      }),
    );

    expect(url.origin).toBe("https://www.dropbox.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("app-key");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://blog.test/api/me/connections/dropbox/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("files.metadata.read files.content.read");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("token_access_type")).toBe("offline");
  });

  it("exchanges an authorization code with Basic auth", async () => {
    process.env.DROPBOX_APP_KEY = "app-key";
    process.env.DROPBOX_APP_SECRET = "app-secret";
    process.env.DROPBOX_OAUTH_REDIRECT_URI =
      "https://blog.test/api/me/connections/dropbox/callback";

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          account_id: "account-1",
          expires_in: 14_400,
          refresh_token: "refresh-token",
          scope: "files.metadata.read files.content.read",
          token_type: "bearer",
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;

    const tokens = await exchangeDropboxOAuthCode({
      code: "oauth-code",
    });

    expect(tokens).toEqual({
      accessToken: "access-token",
      accountId: "account-1",
      expiresIn: 14_400,
      refreshToken: "refresh-token",
      scope: "files.metadata.read files.content.read",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dropboxapi.com/oauth2/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("app-key:app-secret").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        }),
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect(String(init.body)).toContain("code=oauth-code");
    expect(String(init.body)).toContain("grant_type=authorization_code");
  });

  it("refreshes an access token with the stored refresh token", async () => {
    process.env.DROPBOX_APP_KEY = "app-key";
    process.env.DROPBOX_APP_SECRET = "app-secret";

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          expires_in: 14_400,
          scope: "files.metadata.read files.content.read",
          token_type: "bearer",
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;

    const tokens = await refreshDropboxOAuthToken("stored-refresh-token");

    expect(tokens.accessToken).toBe("new-access-token");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;

    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("refresh_token=stored-refresh-token");
  });
});
