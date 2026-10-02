---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Avoid materializing unused multipart request bodies

Wrangler no longer creates a full text copy of multipart API request bodies when debug logs are disabled or sanitized. This substantially reduces peak memory use when uploading large batches of static assets while preserving request-body output when unsanitized debug logging is explicitly enabled.
