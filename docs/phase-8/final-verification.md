# Phase 8 Final Verification

## Scope

Phase 8 changes Dropbox from a single server token test path into a user-owned external knowledge connection.

Implemented scope:

- `ExternalKnowledgeConnection` model for provider, owner, status, scopes, token ciphertext, expiration, sync time, and last error.
- AES-GCM token encryption using `EXTERNAL_CONNECTION_ENCRYPTION_KEY`.
- Dropbox OAuth start and callback APIs.
- Dropbox connection list and disconnect APIs.
- Dropbox Markdown list, content, and sync APIs now use the logged-in user's Dropbox connection token.
- Dropbox access tokens refresh automatically when an expiry timestamp is near.
- `/{username}/settings/connections` UI for Dropbox connect/disconnect and Notion-ready provider surface.

## API Surface

- `GET /api/me/connections`
- `GET /api/me/connections/dropbox/start`
- `GET /api/me/connections/dropbox/callback`
- `DELETE /api/me/connections/dropbox`
- `GET /api/me/dropbox/markdown`
- `GET /api/me/dropbox/markdown/content?path={path}`
- `POST /api/me/dropbox/markdown/sync`

## Isolation Rules

Dropbox OAuth tokens are stored per `ownerId`.

Dropbox Markdown documents remain unique by `(ownerId, pathLower)`.

Dropbox Markdown vector metadata keeps `ownerId`, `sourceType`, `sourceId`, `sourcePath`, and `sourceTitle`, so RAG search can continue filtering per user.

## Environment

Required for in-app Dropbox connection:

```bash
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=
DROPBOX_OAUTH_REDIRECT_URI=
DROPBOX_OAUTH_SCOPES=files.metadata.read files.content.read
EXTERNAL_CONNECTION_ENCRYPTION_KEY=
```

Development-only CLI fallback:

```bash
DROPBOX_ACCESS_TOKEN=
```

## Verification Commands

```bash
npm --prefix aijinhoblog run prisma:validate
npm --prefix aijinhoblog run prisma:generate
npm --prefix aijinhoblog run format:check
npm --prefix aijinhoblog run lint
npm --prefix aijinhoblog run test
npm --prefix aijinhoblog run build
```

## Manual Acceptance

1. Log in as user A and open `/{username}/settings/connections`.
2. Connect Dropbox through OAuth.
3. Confirm `GET /api/me/dropbox/markdown` returns user A's Markdown files.
4. Run `POST /api/me/dropbox/markdown/sync`.
5. Ask a memory question and confirm Dropbox sources belong to user A.
6. Log in as user B and confirm user A's Dropbox sources are not visible.
7. Disconnect Dropbox for user A and confirm Dropbox list/sync APIs return a connection-required error.
