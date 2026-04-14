---
"miniflare": patch
---

Fix local explorer KV bulk / get for large payloads.

Previously when trying to view a KV namespace which contains large value payloads it would result in returning a 413 HTTP response.
