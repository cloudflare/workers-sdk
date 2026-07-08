---
"miniflare": minor
---

Experimental: expose local observability over the Local Explorer HTTP API

Surfaces the captured trace store on the Local Explorer API (served at `/cdn-cgi/explorer/api`) through a single read endpoint, so the UI, agents, and tools all read local observability data the same way and can discover it via the OpenAPI document:

- `POST /local/observability/query` — run one read-only (`SELECT`/`WITH`) SQL query, optionally with bound `params`, and get back `{ columns, rows }`.

There are no purpose-built per-view routes: the query surface is the API, which mirrors the direction of the production Observability API. The `spans`/`logs` schema (the query contract) and the `json(attributes)` guidance are published in the endpoint's OpenAPI description, so callers know the columns without guessing. The endpoint proxies to the internal collector (bound into the explorer only when observability is enabled) and returns Cloudflare API envelope responses.
