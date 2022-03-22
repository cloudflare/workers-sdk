---
"wrangler": patch
---

fix: allow the `build` field to be inherited/overridden in a named environment"

Now the `build` field can be specified within a named environment, overriding whatever
may appear at the top level.

Resolves https://github.com/cloudflare/wrangler2/issues/588
