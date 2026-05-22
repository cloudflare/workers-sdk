---
"miniflare": patch
---

Fix TCP requests failing when `outboundService` is configured

Workers using `outboundService` can now open TCP connections with `cloudflare:sockets`. Previously, TCP requests could throw an error when a custom outbound service was configured.
