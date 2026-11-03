---
"@cloudflare/vite-plugin": patch
---

Fix signed Accept-Encoding headers on the experimental local R2 S3 endpoint

Preserve the original S3 request header in the Vite request adapter so clients that sign `Accept-Encoding: identity` can use the endpoint exposed by Vite development and preview without `SignatureDoesNotMatch` errors. The runtime verifies the exact value signed by the client.
