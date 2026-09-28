---
"miniflare": patch
---

Raise the local R2 custom metadata limit to 8 KiB

R2 `put()` now accepts up to 8,192 bytes of custom metadata, matching the documented R2 limit. Previously, Miniflare rejected metadata larger than 2 KiB.
