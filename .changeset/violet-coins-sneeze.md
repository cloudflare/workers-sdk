---
"create-cloudflare": minor
---

feat: Add a `typegen` script to workers templates to dynamically generate a type definition from `wrangler.toml`.

This also updates the full-stack templates to rename the `build-cf-types` script to `typegen` for consistency. Inline type definitons that previously existed in the `index.ts` of worker scripts have been removed and replaced with a comment informing the user of the `typegen` script.
