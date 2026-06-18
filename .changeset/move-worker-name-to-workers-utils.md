---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Move `unstable_getWorkerNameFromProject` from wrangler to `@cloudflare/workers-utils`

The `unstable_getWorkerNameFromProject` export has been removed from the `wrangler` package. This function is now available as `getWorkerNameFromProject` (without the `unstable_` prefix) from `@cloudflare/workers-utils`. If you were importing this function from `wrangler`, update your import to use `@cloudflare/workers-utils` instead.
