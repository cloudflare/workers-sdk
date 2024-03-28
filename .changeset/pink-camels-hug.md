---
"miniflare": minor
---

feature: respect incoming `Accept-Encoding` header and ensure `Accept-Encoding`/`request.cf.clientAcceptEncoding` set correctly

Previously, Miniflare would pass through the incoming `Accept-Encoding` header to your Worker code. This change ensures this header is always set to `Accept-Encoding: br, gzip` for incoming requests to your Worker. The original value of `Accept-Encoding` will be stored in `request.cf.clientAcceptEncoding`. This matches [deployed behaviour](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#accept-encoding).
