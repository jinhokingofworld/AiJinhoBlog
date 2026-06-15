# Deployment Guide

## Runtime Requirements

- Node.js 20.9 or newer
- MySQL 8.4 compatible database
- ChromaDB reachable from the Next.js server
- OpenAI API key for embedding, RAG answer generation, and Agent generation
- Dropbox OAuth app with read-only file scopes when Dropbox Markdown sync is enabled

## Required Environment

Use the root `.env.example` as the source of shared configuration names. Production secrets must be configured in the deployment platform, not committed to the repository.

- `DATABASE_URL`: production MySQL connection string
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_EMBEDDING_MODEL`: embedding model, default `text-embedding-3-small`
- `OPENAI_RAG_MODEL`: generation model for RAG and Agent flows
- `CHROMA_URL`: ChromaDB HTTP endpoint
- `CHROMA_COLLECTION`: Chroma collection name
- `DROPBOX_APP_KEY`: Dropbox OAuth app key
- `DROPBOX_APP_SECRET`: Dropbox OAuth app secret
- `DROPBOX_OAUTH_REDIRECT_URI`: registered Dropbox OAuth callback URL
- `DROPBOX_OAUTH_SCOPES`: Dropbox read-only scopes, default `files.metadata.read files.content.read`
- `EXTERNAL_CONNECTION_ENCRYPTION_KEY`: encryption key for user-owned external provider tokens
- `DROPBOX_ACCESS_TOKEN`: development-only fallback for the CLI Dropbox sync script
- `AI_HTTP_TIMEOUT_MS`, `AI_HTTP_TOTAL_ATTEMPTS`, `AI_HTTP_RETRY_DELAY_MS`: external AI request controls
- `AI_RATE_LIMIT_WINDOW_MS`: per-user endpoint rate limit window, default `60000`
- `AI_RATE_LIMIT_REQUESTS`: allowed AI requests per user/endpoint/window, default `20`
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

## Docker Release Without Nginx

The first production deployment can expose the Next.js container directly on
port `3000`. A reverse proxy or load balancer can be added later without
changing the application image.

Prepare the server.

```bash
cp deploy.env.example deploy.env
vi deploy.env
```

For a single-server Docker Compose deployment, use service names inside the
container network.

```bash
DATABASE_URL=mysql://aijinho:<password>@mysql:3306/aijinhoblog
CHROMA_URL=http://chroma:8000
NEXT_PUBLIC_APP_URL=http://<server-ip>:3000
DROPBOX_OAUTH_REDIRECT_URI=http://<server-ip>:3000/api/me/connections/dropbox/callback
```

Build the image and start MySQL and ChromaDB.

```bash
docker compose --env-file deploy.env -f docker-compose.prod.yml build
docker compose --env-file deploy.env -f docker-compose.prod.yml up -d mysql chroma
```

Apply production database migrations before starting the app.

```bash
docker compose --env-file deploy.env -f docker-compose.prod.yml --profile release run --rm migrate
```

Start the app.

```bash
docker compose --env-file deploy.env -f docker-compose.prod.yml up -d app
```

Check logs.

```bash
docker compose --env-file deploy.env -f docker-compose.prod.yml logs -f app
```

At this stage the app is reachable at:

```text
http://<server-ip>:3000
```

When a load balancer or reverse proxy is added later, update:

```bash
NEXT_PUBLIC_APP_URL=https://<domain>
DROPBOX_OAUTH_REDIRECT_URI=https://<domain>/api/me/connections/dropbox/callback
```

Then register the exact same Dropbox redirect URI in the Dropbox app console
and redeploy the app container.

## Operational Checks

- Confirm `GET /login` and `GET /signup` render.
- Sign up or log in with a production test user.
- Create, edit, and delete a private draft and a public post.
- Connect Dropbox at `/{username}/settings/connections` for a production test user.
- Run Dropbox Markdown sync for that user before relying on RAG answers.
- Ask a memory question and verify every source belongs to the current user.
- Run the Agent page and verify recommendations, rewrite, refactor, and apply-to-post.
- Confirm AI request logs are created for RAG and indexing flows.
- Confirm repeated AI endpoint calls return 429 after the configured quota.

## Known Limits

- ChromaDB must be backed up separately from MySQL.
- Dropbox sync uses per-user OAuth connections and currently stays read-only.
- MCP tools require an explicit owner in tool input or `AIJINHOBLOG_MCP_OWNER_*`.
- AI calls are retried with bounded timeout and attempts, and per-user endpoint rate limits are stored in MySQL.
