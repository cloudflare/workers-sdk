---
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"miniflare": minor
---

Fix `cloudflare:node` HTTP server dispatch in Vite and Vitest

Vite and Vitest evaluate user modules inside pinned runner Durable Objects but invoke exported handlers from another context. Their internal singleton runners now expose that actor's Node.js server port registrations to the isolate, allowing handlers created with `httpServerHandler()` to find servers started during module evaluation without changing port isolation for other actors.
