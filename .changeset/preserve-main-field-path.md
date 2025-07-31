---
"wrangler": patch
---

Preserve original main field value in readConfig output

The `readConfig` function now preserves the original relative path specified in the `main` field instead of resolving it to an absolute path. This allows other consumers of `readConfig` to access the original configuration value while Wrangler continues to resolve paths appropriately during deployment and development.
