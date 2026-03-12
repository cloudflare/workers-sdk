---
"wrangler": minor
---

Add `wrangler ai-search` command namespace for managing Cloudflare AI Search instances

Introduces a CLI surface for the Cloudflare AI Search API (open beta), including:

- Instance management: `ai-search list`, `create`, `get`, `update`, `delete`
- Semantic search: `ai-search search` with repeatable `--filter key=value` flags
- Instance stats: `ai-search stats`

The `create` command uses an interactive wizard to guide configuration. All commands require authentication via `wrangler login`.
