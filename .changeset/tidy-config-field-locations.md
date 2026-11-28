---
"@cloudflare/config": patch
"@cloudflare/vitest-plugin": patch
"wrangler": patch
---

Explain where misplaced fields belong in `cloudflare.config.ts` validation errors

Errors for top-level fields such as `accountId` placed under `worker` now explain that they belong at the top level. Worker fields placed at the top level also include a hint to move them inside `worker`.
