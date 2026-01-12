---
"wrangler": patch
---

Fix incorrect warning about multiple environments when using redirected config

Previously, when using a redirected config (via `configPath` in another config file) that originated from a config with multiple environments, wrangler would incorrectly warn about missing environment specification. This fix ensures the warning is only shown when the actual config being used has multiple environments defined, not when the original config did.
