---
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"miniflare": patch
"wrangler": patch
---

Prevent delayed internal errors from fetch-only remote bindings

Fetch-only remote bindings such as D1 and R2 previously opened an unused WebSocket RPC session. RPC sessions are now created only when an RPC method is called.
