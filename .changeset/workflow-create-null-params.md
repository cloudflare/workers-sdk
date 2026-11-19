---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Give local Workflow instances created with `params: null` an empty object as their payload, as production does

Previously, `create({ params: null })` gave the Workflow `null` as `event.payload`. `createBatch()` is unchanged.
