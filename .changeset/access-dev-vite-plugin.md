---
"@cloudflare/vite-plugin": patch
---

Honor `access.dev` when running Workers with `@cloudflare/vite-plugin`, so `ctx.access.getIdentity()` returns the configured identity.
