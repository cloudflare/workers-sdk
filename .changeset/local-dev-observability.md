---
"@cloudflare/vite-plugin": minor
"miniflare": minor
"wrangler": minor
---

Add experimental local-dev observability trace capture (`X_LOCAL_OBSERVABILITY`)

When `X_LOCAL_OBSERVABILITY=true` is set, `wrangler dev` and the Cloudflare Vite
plugin automatically capture structured traces for whatever worker you're
developing — no extra config. Miniflare injects an internal trace collector as
a streaming-tail consumer of your worker(s), enables the required compatibility
flags, and persists each request's spans and logs to an internal D1 store that
the Local Explorer's Observability tab reads. This is experimental and off by
default; it can change without a major version bump.
