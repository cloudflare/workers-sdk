---
"wrangler": minor
---

Add `wrangler ai-search` command namespace for managing Cloudflare AI Search instances

Introduces a full CLI surface for the Cloudflare AI Search API (open beta), including:

- Instance management: `ai-search list`, `create`, `get`, `update`, `delete`
- Semantic search: `ai-search search` with repeatable `--filter key=value` flags
- RAG chat: `ai-search chat` with streaming token output and source citations
- Instance stats: `ai-search stats`
- Items inspection: `ai-search items list`, `ai-search items get`
- Items logs and chunks: `ai-search items logs`, `ai-search items chunks`
- Indexing jobs: `ai-search jobs list`, `create`, `get`, `logs`
- Token management: `ai-search tokens list`, `create`, `get`, `update`, `delete`
- Interactive playground: `ai-search playground <name>` — a REPL for testing search and chat queries

The `create` command uses an interactive wizard to guide configuration. All commands require authentication via `wrangler login`.
