---
"create-cloudflare": minor
---

Add AGENTS.md to Workers templates for AI coding agent guidance

New Workers projects created via `create-cloudflare` now include an `AGENTS.md` file that provides AI coding agents with retrieval-led guidance for Cloudflare APIs. This helps agents avoid using outdated knowledge from their training data and instead consult current documentation.

The file includes:

- Links to Cloudflare documentation and MCP servers
- Essential wrangler commands (`dev`, `deploy`, `types`)
- Pointers to product-specific documentation for limits and APIs
