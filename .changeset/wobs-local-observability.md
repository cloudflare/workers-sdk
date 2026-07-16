---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Add local-dev observability

`wrangler dev` and the Vite plugin now capture a trace for every local Worker invocation — spans, logs, and `console.*` output — while the dev server runs, with no setup. Requests that cross service bindings, Durable Objects, or the Vite runner in the same dev process are stitched into a single trace, and each span is attributed to the Worker that produced it.

You can explore this data two ways:

- A new Observability tab in the Local Explorer, with a Traces view (recent invocations, an inline timeline waterfall, and filters) and a Logs view.
- A read-only SQL endpoint at `/cdn-cgi/explorer/api/local/observability/query`, discoverable via the Local Explorer's OpenAPI document, so coding agents and tools can query the same `spans` and `logs` tables.

Everything stays on your machine. Capture is on by default; set `X_LOCAL_OBSERVABILITY=false` to turn it off.
