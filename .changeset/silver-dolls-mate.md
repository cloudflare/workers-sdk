---
"wrangler": patch
---

fix: read `isLegacyEnv` correctly

This fixes the signature for `isLegacyEnv()` since it doesn't use args, and we fix reading legacy_env correctly when creating a draft worker when creating a secret.
