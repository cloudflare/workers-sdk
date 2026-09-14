---
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"miniflare": minor
---

Fix `cloudflare:node` HTTP server dispatch in Vite and Vitest

Vite and Vitest evaluate user modules inside pinned runner Durable Objects but invoke exported handlers from another context. Their internal runner namespaces now explicitly share the isolate's Node.js server port registrations, allowing handlers created with `httpServerHandler()` to find servers started during module evaluation.
