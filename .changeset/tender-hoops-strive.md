---
"@cloudflare/vite-plugin": minor
"miniflare": minor
"wrangler": minor
---

Enable local explorer by default

This ungates the local explorer, a UI that lets you inspect the state of D1, DO and KV resources locally by visiting `/cdn-cgi/explorer` during local development.

Note: this feature is still experimental, and can be disabled by setting the env var `X_LOCAL_EXPLORER=false`.
