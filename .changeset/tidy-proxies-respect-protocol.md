---
"miniflare": patch
"wrangler": patch
---

Honor `X-Forwarded-Proto` for incoming development requests behind TLS-terminating proxies

Miniflare now uses the original client protocol when constructing URLs for network requests. This also prevents Wrangler from downgrading HTTPS URLs in response headers such as `Location` and `WWW-Authenticate` when a tunnel forwards requests over HTTP. Explicit programmatic request URLs and configured upstream origins remain authoritative.
