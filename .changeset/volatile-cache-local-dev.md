---
"miniflare": minor
"wrangler": minor
---

Support experimental Volatile Cache bindings in local development

`wrangler dev` now maps `volatile_cache` entries in `unsafe.bindings` to workerd's in-memory `MemoryCache` implementation, including the configured cache ID and size limits. Production deployment behavior is unchanged.
