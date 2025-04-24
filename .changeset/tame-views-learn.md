---
"@cloudflare/vite-plugin": patch
---

Fixes two bugs that were caused by not accounting for an undocumented method on Workers and Durable Objects. `ctx.blockConcurrencyWhile` will now successfully block execution in Durable Objects and invoking Workers will no longer cause unhandled rejections.
