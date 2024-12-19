---
"wrangler": patch
---

feat: add experimental_patchConfig()

`experimental_patchConfig()` can add to a user's config file. It preserves comments if its a `wrangler.jsonc`. However, it is not suitable for `wrangler.toml` with comments as we cannot preserve comments on write.
