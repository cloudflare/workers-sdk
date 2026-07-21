---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Add local-dev observability

`wrangler dev` and the Vite plugin now capture a trace for every local Worker invocation - spans, logs, and `console.*` output, including requests that cross worker or Durable Object boundaries.

You can explore this data two ways:

- A new Observability tab in the Local Explorer, with a Traces view (recent invocations, an inline timeline waterfall, and filters) and an Events view.
- A read-only SQL endpoint at `/cdn-cgi/explorer/api/local/observability/query`, discoverable via the Local Explorer's OpenAPI document, so coding agents and tools can query the same `spans` and `logs` tables.

While this is in testing it's off by default; set `X_LOCAL_OBSERVABILITY=true` to turn it on. It will be on by default in the public release.
