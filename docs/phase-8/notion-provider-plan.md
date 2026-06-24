# Notion Provider Plan

## Goal

Notion will be added as another user-owned external knowledge source after Dropbox OAuth is stable.

The provider must preserve the same isolation rule:

- every connection belongs to one `ownerId`
- every indexed document stores the same `ownerId`
- every vector metadata record includes the same `ownerId`
- RAG search filters by the logged-in user before hydration and answer generation

## Current Provider Foundation

Phase 8 adds `ExternalKnowledgeConnection` with:

- `ownerId`
- `provider`: `DROPBOX` or `NOTION`
- `providerAccountId`
- `providerAccountName`
- `scope`
- encrypted access and refresh tokens
- `expiresAt`
- `status`
- `lastSyncedAt`
- `lastError`

This lets Notion reuse the same connection lifecycle as Dropbox:

1. start OAuth or register an integration token
2. store encrypted tokens per user
3. list source documents with the user's token
4. normalize provider-specific content to plain text
5. write vectors with `ownerId` metadata

## Authentication Choice

Preferred MVP path: Notion OAuth.

Reason:

- it matches the per-user product goal
- users can connect their own workspace without sharing a server-wide integration token
- revocation and reconnect flows fit the `ExternalKnowledgeConnection` model

Fallback for local testing: internal integration token entered by the user and encrypted in `ExternalKnowledgeConnection`.

## Document Model

Dropbox keeps the current `DropboxMarkdownDocument` cache because it is already used by Phase 3 and Phase 4.

Notion should add a provider-specific cache table instead of overloading the Dropbox table:

- `NotionPageDocument`
- `ownerId`
- `notionPageId`
- `title`
- `url`
- `lastEditedAt`
- `contentHash`
- `plainText`
- `lastSyncedAt`

The vector metadata source type should expand to:

- `POST`
- `DROPBOX_MD`
- `NOTION_PAGE`

## Normalization

Notion block extraction should produce deterministic plain text:

- page title first
- headings in source order
- paragraph, bulleted list, numbered list, quote, code, callout, and toggle text
- child blocks flattened in traversal order
- unsupported binary blocks skipped with a short placeholder only when useful for context

Chunking should reuse the existing `normalizeKnowledgeText` and `splitTextIntoChunks` pipeline so RAG ranking stays comparable across posts, Dropbox Markdown, and Notion pages.

## RAG Hydration

The current RAG hydration has provider-specific branches for `POST` and `DROPBOX_MD`.

Notion should add a small source adapter boundary:

- source type parser
- DB hydration query
- source label and URL/path serialization

This keeps answer citation rendering stable when more providers are added.

## Reindex Policy

Notion sync should:

- list accessible pages for the logged-in user's connection
- compare `lastEditedAt` and `contentHash`
- skip unchanged pages
- delete or mark inaccessible pages as stale
- delete stale vector IDs before reindexing

Refresh token failure should mark the `ExternalKnowledgeConnection` as `ERROR` and require reconnect.
