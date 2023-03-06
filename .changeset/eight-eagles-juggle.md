---
"wrangler": patch
---

fix: remove `vitest` from `wrangler init`'s generated `tsconfig.json` `types` array

Previously, `wrangler init` generated a `tsconfig.json` with `"types": ["@cloudflare/workers-types", "vitest"]`, even if Vitest tests weren't generated.
Unlike Jest, Vitest [doesn't provide global APIs by default](https://vitest.dev/config/#globals), so there's no need for ambient types.
