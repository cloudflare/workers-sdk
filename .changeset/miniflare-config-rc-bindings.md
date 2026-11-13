---
"miniflare": minor
---

Rename the Pipelines, K2 and Analytics SQL `env` binding fields to match `@cloudflare/config`

Config-style `env` bindings now use these shapes:

- `{ type: "pipeline", streamId }` instead of `{ type: "pipeline", name }`
- `{ type: "k2", id }` instead of `{ type: "k2", stream }`
- `{ type: "analytics-sql" }` instead of `{ type: "analytics" }`
