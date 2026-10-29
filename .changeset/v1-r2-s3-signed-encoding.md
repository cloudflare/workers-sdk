---
"@cloudflare/vite-plugin": patch
---

Fix signed Accept-Encoding headers on the experimental local R2 S3 endpoint

Upgrade Miniflare to `5.20261023.3-beta` and Wrangler to `4.155.1` so S3 clients that sign `Accept-Encoding: identity` can use the endpoint exposed by Vite development and preview without `SignatureDoesNotMatch` errors.
