---
"wrangler": patch
---

feat: add experimental_patchConfig() and experimental_readRawConfig()

Adds two Wrangler APIs:

1. experimental_readRawConfig() will find and read a config file
2. experimental_patchConfig() can add to a user's config file. It preserves comments if its a `wrangler.jsonc`. However, it is not suitable for `wrangler.toml` with comments as we cannot preserve comments on write.
