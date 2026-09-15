---
"miniflare": minor
---

Add production-compatible KV bulk write and delete routes to Local Explorer

API clients can now write and delete multiple local KV entries by changing only their Cloudflare API base URL. The new routes support production request and response shapes, including base64 values, expiration options, and metadata.
