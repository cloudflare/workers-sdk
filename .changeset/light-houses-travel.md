---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

fix: make sure that `experimental_patchConfig` doesn't throw if it encounters a `null` value
