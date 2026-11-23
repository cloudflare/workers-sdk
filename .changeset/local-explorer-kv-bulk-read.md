---
"miniflare": patch
---

Honor KV bulk read options in Local Explorer

Local Explorer now parses values when `type: "json"` is set and includes metadata when `withMetadata: true` is set. Both options also work together, including when using `cf kv keys bulk-get --local`.

Bulk reads also preserve metadata for stored JSON `null` values when requested. Missing keys still return bare `null`.
