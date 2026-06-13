# Deployment Guide

## Runtime Requirements

- Node.js 20.9 or newer
- MySQL 8.4 compatible database
- ChromaDB reachable from the Next.js server
- OpenAI API key for embedding, RAG answer generation, and Agent generation
- Dropbox access token with read-only file scopes when Dropbox Markdown sync is enabled

## Required Environment

Use the root `.env.example` as the source of shared configuration names. Production secrets must be configured in the deployment platform, not committed to the repository.

- `DATABASE_URL`: production MySQL connection string
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_EMBEDDING_MODEL`: embedding model, default `text-embedding-3-small`
- `OPENAI_RAG_MODEL`: generation model for RAG and Agent flows
- `CHROMA_URL`: ChromaDB HTTP endpoint
- `CHROMA_COLLECTION`: Chroma collection name
- `DROPBOX_ACCESS_TOKEN`: Dropbox Markdown read token
- `AI_HTTP_TIMEOUT_MS`, `AI_HTTP_TOTAL_ATTEMPTS`, `AI_HTTP_RETRY_DELAY_MS`: external AI request controls
- `AIJINHOBLOG_MCP_OWNER_*`: default owner only for local or single-owner MCP sessions

## Release Steps

Run from the repository root.

```bash
npm ci
npm --prefix aijinhoblog ci
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run format:check
npm run test
npm run build
```

Apply database migrations before switching traffic.

```bash
npm run prisma:migrate
```

Start the app after the migration succeeds.

```bash
npm --prefix aijinhoblog run start
```

## Operational Checks

- Confirm `GET /login` and `GET /signup` render.
- Sign up or log in with a production test user.
- Create, edit, and delete a private draft and a public post.
- Run Dropbox Markdown sync for a test user before relying on RAG answers.
- Ask a memory question and verify every source belongs to the current user.
- Run the Agent page and verify recommendations, rewrite, refactor, and apply-to-post.
- Confirm AI request logs are created for RAG and indexing flows.

## Known Limits

- ChromaDB must be backed up separately from MySQL.
- Dropbox sync is token-based and currently read-only.
- MCP tools require an explicit owner in tool input or `AIJINHOBLOG_MCP_OWNER_*`.
- AI calls are retried with bounded timeout and attempts, but there is no per-user rate limit yet.
- Dependency audit advisories from framework or transitive packages are tracked in issue #41.
