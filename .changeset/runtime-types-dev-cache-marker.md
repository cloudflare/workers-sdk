---
"wrangler": patch
---

Fix runtime type caching when `wrangler dev` auto-regenerates types

When `dev.generate_types` (or `wrangler dev --types`) regenerated an out-of-date `worker-configuration.d.ts`, the written file omitted the `// Begin runtime types` marker (and the `/* eslint-disable */` header) that `wrangler types` writes. As a result, later runs could not detect the cached runtime types and always regenerated them. The auto-regenerated file now matches `wrangler types` output, restoring the cache.
