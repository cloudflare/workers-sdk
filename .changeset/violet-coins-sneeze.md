---
"create-cloudflare": minor
---

feat: Add a `cf-typegen` script to workers templates to dynamically generate a type definition from `wrangler.toml`.

This also updates the full-stack templates to rename the `build-cf-types` script to `cf-typegen` for consistency. Inline type definitons that previously existed in the `index.ts` of worker scripts have been removed and replaced with a comment informing the user of the `cf-typegen` script.
