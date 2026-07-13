---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Experimental: add a Traces view to the Local Explorer's Observability section, and enable local observability by default

Adds an Observability entry to the Local Explorer sidebar with a Traces view backed by the observability HTTP API. It lists recent traces (operation, duration, span/error counts) with a query bar (free text plus `status:`, `kind:`, `dur:` and attribute filters), and expands each trace inline into a timeline waterfall: spans nested by parent, collapsible, with per-span bars, worker-invocation boundaries and a span detail panel. Renders with Kumo components.

As the final observability PR in the stack, this also flips the default: `X_LOCAL_OBSERVABILITY` now defaults to `true`, so local-dev capture is on by default under both `wrangler dev` and the Vite plugin. Set `X_LOCAL_OBSERVABILITY=false` to opt out.
