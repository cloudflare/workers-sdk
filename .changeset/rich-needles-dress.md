---
"wrangler": patch
---

fix: relax the `getPlatformProxy`'s' cache request/response types

prior to these changes the caches obtained from `getPlatformProxy`
would use `unknown`s as their types, this proved too restrictive
and incompatible with the equivalent `@cloudflare/workers-types`
types, we decided to use `any`s instead to allow for more flexibility
whilst also making the type compatible with workers-types
