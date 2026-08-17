---
"wrangler": patch
"@cloudflare/vitest-pool-workers": patch
---

Honor `access.dev` when running Workers with `@cloudflare/vitest-pool-workers`, so `ctx.access.getIdentity()` returns the configured identity just as it does with `wrangler dev`.
