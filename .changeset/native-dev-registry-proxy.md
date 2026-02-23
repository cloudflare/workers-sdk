---
"miniflare": minor
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Use workerd debug port RPC for cross-process service bindings, Durable Objects, and tail workers in multi-worker dev. This enables DO RPC across dev sessions and fixes WebSocket proxying issues.
