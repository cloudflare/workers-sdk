---
"@cloudflare/local-explorer-ui": patch
"miniflare": patch
---

Fix local explorer KV bulk / get for large payloads.

Keep Miniflare local explorer KV bulk get behavior aligned with the Cloudflare API by enforcing the aggregate payload size limit. Instead now the local explorer UI KV namespace view to fetch values per-key, so large namespaces still load successfully without relying on bulk get for table hydration.
