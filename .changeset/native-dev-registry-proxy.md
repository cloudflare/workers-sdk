---
"miniflare": minor
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Use `workerd`'s debug port to power cross-process service bindings, Durable Objects, and tail workers via the dev registry. This enables Durable Object RPC via the dev registry, and is an overall stability improvement.
