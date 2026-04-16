---
"wrangler": patch
---

Allow `wrangler r2 bucket list` to run without a valid Wrangler config

This is an account-level command and does not require parsing `wrangler.toml`/`wrangler.jsonc`. Previously, an invalid local config could prevent listing buckets, making it harder to fix the config.
