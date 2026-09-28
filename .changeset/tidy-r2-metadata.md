---
"miniflare": patch
---

Raise the local R2 custom metadata limit to 8 KiB

R2 `put()` now accepts up to 8,192 bytes of custom metadata, matching the documented R2 limit. Previously, Miniflare rejected metadata larger than 2 KiB.

Multipart upload creation now enforces the same limit through both R2 bindings and the local S3 API. Oversized metadata is rejected with error 10012 through R2 bindings, or HTTP 400 `MetadataTooLarge` for S3 uploads, copies, and multipart initiation.
