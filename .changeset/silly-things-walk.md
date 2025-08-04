---
"miniflare": patch
"wrangler": patch
"create-cloudflare": patch
---

Add macOS version validation to prevent EPIPE errors on unsupported macOS versions (below 13.5). Miniflare and C3 fail hard while Wrangler shows warnings but continues execution.
