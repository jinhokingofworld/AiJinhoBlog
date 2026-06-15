# Backend Structure

`backend/` contains server-side application code used by Next.js route handlers,
server actions, scripts, and the MCP server.

## Directories

- `core/`: shared infrastructure such as Prisma, HTTP helpers, env loading, and validation.
- `auth/`: password/session/JWT helpers and current-user resolution.
- `users/`: account settings, profile serialization, and user upload handling.
- `posts/`: post CRUD, folders, and external-link/image draft creation.
- `ai/`: embeddings, ChromaDB access, RAG, rate limits, and writing-agent logic.
- `integrations/`: external provider connections and provider-specific sync code.
- `mcp/`: MCP tool registration for blog operations.
- `actions/`: server actions used directly by UI flows.

Route files in `app/` should stay thin and delegate domain work to these modules.
