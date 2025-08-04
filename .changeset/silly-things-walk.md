---
"@cloudflare/cli": minor
"miniflare": patch
"wrangler": patch
"create-cloudflare": patch
---

Add macOS version validation to prevent EPIPE errors on unsupported macOS versions (below 13.5). Miniflare fails hard while Wrangler and C3 show warnings but continue execution.
