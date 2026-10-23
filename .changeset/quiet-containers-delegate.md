---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Leave local Container cleanup to Miniflare

Wrangler and the Vite plugin no longer scan Docker for containers by image tag when they rebuild or exit. Miniflare removes the application containers, networking sidecars, and snapshot clone volumes that workerd creates, including the sidecars that the image-tag scans missed.
