---
"miniflare": patch
---

Fix local explorer KV bulk / get for large payloads.

Previously when trying to view a KV namespace which contains large value payloads it would result in returning a 413 HTTP response.
As such, the endpoint now fetches each key individually instead of using the KV bulk-get API, which has a 25 MB aggregate size limit.
