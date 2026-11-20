---
"@cloudflare/autoconfig": minor
"@cloudflare/codemods": patch
---

Move the Wrangler configuration migration into autoconfig

`@cloudflare/codemods` now runs `wrangler-to-cf` through `@cloudflare/autoconfig`, which owns the migration so that every project setup path can share it.
