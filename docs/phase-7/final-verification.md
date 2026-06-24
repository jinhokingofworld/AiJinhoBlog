# Phase 7 Final Verification

## Scope

Phase 7 closes the stabilization and deployment preparation requirements in `docs/Plan.md`.

## Automated Coverage

- Authentication crypto and validation tests cover password hashing, JWT/session primitives, and payload validation.
- Post tests cover list filters, pagination, draft/private visibility, and public author field selection.
- RAG tests cover owner-scoped vector queries and owner-scoped source hydration for posts, Dropbox Markdown documents, and Notion-ready page sources.
- MCP tests verify that tools cannot silently resolve the first user when no owner identifier is configured.
- Agent tests cover writing recommendations, style profile generation, rewrite, refactor persistence, and apply-to-post owner checks.

## Security Review

- Public post selections exclude author email.
- Private and draft posts are readable by owners only.
- RAG vector queries are separated by `authorId` for posts and `ownerId` for Dropbox Markdown and Notion-ready external sources.
- Source hydration rechecks `authorId` and `ownerId` before returning links or file paths.
- MCP owner resolution now requires `ownerUsername`, `ownerEmail`, `ownerId`, or an explicit `AIJINHOBLOG_MCP_OWNER_*` environment variable.
- OpenAI and Dropbox tokens are documented only as environment variables in `.env.example`; no secret value is committed.
- External link and image draft creation stores content as private drafts by default through MCP tools.

## Performance And Cost Review

- RAG search limits are clamped to 1-12 results.
- RAG answer context is capped at 12,000 characters.
- OpenAI and Chroma calls use retry and timeout controls.
- RAG and indexing flows persist `AiRequestLog` records with model, status, token usage, retry metadata, and error messages where available.
- Per-user AI endpoint rate limiting is stored in MySQL by `userId`, endpoint, and time window.

## Deployment Readiness

- `.env.example` documents local and production environment variable names.
- `docs/deployment.md` documents runtime requirements, release commands, migration order, operational checks, and known limits.
- README links the deployment guide and documents Phase 6 Agent entry points.
- GitHub issue templates now match the current Phase 0-7 plan.

## Verification Commands

Run from the repository root.

```bash
npm --prefix aijinhoblog run format:check
npm --prefix aijinhoblog run lint
npm --prefix aijinhoblog test
npm --prefix aijinhoblog run prisma:validate
npm --prefix aijinhoblog run prisma:generate
npm --prefix aijinhoblog run build
```

## Known Follow-up

- Monitor upstream Next and Prisma dependency advisories. Current transitive `postcss` and `@hono/node-server` advisories are mitigated with npm overrides.
