---
"@cloudflare/vite-plugin": patch
---

Preserve HTTP/2 `:authority` header and non-default port in dev server requests

When Vite runs over HTTPS with HTTP/2 enabled, browsers send authority via the `:authority` pseudo-header rather than `Host`. Previously, pseudo-headers were omitted when creating Fetch requests, causing non-default ports to be dropped from `request.url` and `X-Forwarded-Host`. Authority and scheme are now preserved from HTTP/2 pseudo-headers and request properties.
