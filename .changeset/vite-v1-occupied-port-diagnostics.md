---
"@cloudflare/vite-plugin": patch
---

Update Miniflare to preserve occupied-port diagnostics across stderr chunks

Use `miniflare@5.20261012.1-beta` so local development reports the complete address-in-use error even when workerd splits its diagnostic across stderr writes.
